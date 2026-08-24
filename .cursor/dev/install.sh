#!/usr/bin/env bash
# Idempotent environment bootstrap for the booking monorepo.
#
# Installs the system toolchain (Bun, PostgreSQL 18, MongoDB, Redis, NATS, nginx),
# installs JS dependencies, provisions the Postgres roles/databases and applies
# the Drizzle migrations. Safe to re-run: every step is guarded. When the Cloud
# Agent boots from a prebuilt snapshot the system packages already exist, so the
# guards make this finish quickly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export REPO_ROOT
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/env.sh"

log() { echo "[install] $*"; }

# --- Bun -------------------------------------------------------------------
if ! command -v bun >/dev/null 2>&1 && [ ! -x "$HOME/.bun/bin/bun" ]; then
  log "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
fi
export PATH="$HOME/.bun/bin:$PATH"
log "Bun $(bun --version)"

# --- System packages -------------------------------------------------------
need_pg=false; command -v /usr/lib/postgresql/18/bin/postgres >/dev/null 2>&1 || need_pg=true
need_mongo=false; command -v mongod >/dev/null 2>&1 || need_mongo=true
need_redis=false; command -v redis-server >/dev/null 2>&1 || need_redis=true
need_nginx=false; command -v nginx >/dev/null 2>&1 || need_nginx=true

if $need_pg || $need_mongo || $need_redis || $need_nginx; then
  log "Installing base packages..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl ca-certificates gnupg lsb-release apt-transport-https unzip \
    redis-server nginx postgresql-common

  if $need_pg; then
    log "Adding PostgreSQL (PGDG) apt repo and installing postgresql-18..."
    sudo install -d /usr/share/postgresql-common/pgdg
    sudo curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
      | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-18
  fi

  if $need_mongo; then
    log "Adding MongoDB apt repo and installing mongodb-org..."
    curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
      | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor --yes
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/8.0 multiverse" \
      | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list >/dev/null
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mongodb-org
  fi
fi

# --- NATS server + CLI -----------------------------------------------------
if ! command -v nats-server >/dev/null 2>&1; then
  log "Installing nats-server..."
  tmp="$(mktemp -d)"; ver="v2.14.5"
  curl -fsSL "https://github.com/nats-io/nats-server/releases/download/${ver}/nats-server-${ver}-linux-amd64.tar.gz" -o "$tmp/s.tgz"
  tar xzf "$tmp/s.tgz" -C "$tmp"
  sudo install "$tmp/nats-server-${ver}-linux-amd64/nats-server" /usr/local/bin/nats-server
  rm -rf "$tmp"
fi
if ! command -v nats >/dev/null 2>&1; then
  log "Installing nats CLI..."
  tmp="$(mktemp -d)"; ver="0.4.0"
  curl -fsSL "https://github.com/nats-io/natscli/releases/download/v${ver}/nats-${ver}-linux-amd64.zip" -o "$tmp/c.zip"
  unzip -oq "$tmp/c.zip" -d "$tmp"
  sudo install "$tmp/nats-${ver}-linux-amd64/nats" /usr/local/bin/nats
  rm -rf "$tmp"
fi
log "postgres $(/usr/lib/postgresql/18/bin/postgres --version | awk '{print $3}'), mongod $(mongod --version | head -1 | awk '{print $3}'), $(nats-server --version)"

# --- JS dependencies -------------------------------------------------------
log "Installing JS dependencies (bun install)..."
cd "$REPO_ROOT"
bun install

# --- Bring Postgres up so migrations can run -------------------------------
mkdir -p "${DEVSTACK_DIR}"/{logs,run,mongodata,nats,nats-config}
log "Starting PostgreSQL cluster (for migrations)..."
sudo pg_ctlcluster 18 main start || true
for _ in $(seq 1 30); do
  sudo -u postgres pg_isready -q && break || sleep 1
done

# --- Postgres roles + databases -------------------------------------------
create_role_db() {
  local user="$1" pass="$2" dbname="$3"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -tAc \
    "SELECT 1 FROM pg_roles WHERE rolname='${user}'" | grep -q 1 || \
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
    "CREATE ROLE ${user} LOGIN PASSWORD '${pass}';"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${dbname}'" | grep -q 1 || \
    sudo -u postgres createdb -O "${user}" "${dbname}"
}
log "Provisioning Postgres roles and databases..."
create_role_db "${TICKETS_POSTGRES_USER}" "${TICKETS_POSTGRES_PASSWORD}" "${TICKETS_POSTGRES_DB}"
create_role_db "${ORDERS_POSTGRES_USER}" "${ORDERS_POSTGRES_PASSWORD}" "${ORDERS_POSTGRES_DB}"

# --- Ensure hardcoded k8s hostnames resolve (needed by migrations too) -----
"${SCRIPT_DIR}/hosts.sh"

# --- Drizzle migrations ----------------------------------------------------
log "Applying tickets migrations..."
( cd "${REPO_ROOT}/apps/tickets" && bun run drizzle-kit:migrate-dev )
log "Applying orders migrations..."
( cd "${REPO_ROOT}/apps/orders" && bun run drizzle-kit:migrate-dev )

log "Install complete."
