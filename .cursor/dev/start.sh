#!/usr/bin/env bash
# Per-boot startup for the booking dev environment.
#
# Brings up the infra daemons (PostgreSQL, MongoDB, Redis, NATS JetStream), the
# nginx reverse proxy, and (re)creates the NATS stream + durable consumers.
# It is idempotent and returns once everything is healthy; the application dev
# servers themselves run as separate `terminals` processes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export REPO_ROOT
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/env.sh"

log() { echo "[start] $*"; }
mkdir -p "${DEVSTACK_DIR}"/{logs,run,mongodata,nats,nats-config}

# --- hostnames -------------------------------------------------------------
"${SCRIPT_DIR}/hosts.sh"

# --- PostgreSQL ------------------------------------------------------------
log "Starting PostgreSQL..."
sudo pg_ctlcluster 18 main start 2>/dev/null || true
for _ in $(seq 1 30); do sudo -u postgres pg_isready -q && break || sleep 1; done

# --- Redis -----------------------------------------------------------------
log "Starting Redis..."
sudo systemctl restart redis-server 2>/dev/null || redis-server --daemonize yes
for _ in $(seq 1 15); do redis-cli ping >/dev/null 2>&1 && break || sleep 1; done

# --- MongoDB ---------------------------------------------------------------
if ! mongosh --quiet --eval 'db.runCommand({ping:1})' mongodb://127.0.0.1:27017/admin >/dev/null 2>&1; then
  log "Starting MongoDB..."
  mongod --dbpath "${DEVSTACK_DIR}/mongodata" --bind_ip 127.0.0.1 --port 27017 \
    --logpath "${DEVSTACK_DIR}/logs/mongod.log" --fork >/dev/null
fi
for _ in $(seq 1 30); do
  mongosh --quiet --eval 'db.runCommand({ping:1})' mongodb://127.0.0.1:27017/admin >/dev/null 2>&1 && break || sleep 1
done

# --- NATS JetStream --------------------------------------------------------
# Readiness is checked via the HTTP monitoring endpoint (:8222/healthz) because
# `nats server ping` requires a system account that this server doesn't define.
if ! curl -sf http://127.0.0.1:8222/healthz >/dev/null 2>&1; then
  log "Starting NATS JetStream..."
  nohup nats-server -js -sd "${DEVSTACK_DIR}/nats" -p 4222 -m 8222 \
    > "${DEVSTACK_DIR}/logs/nats.log" 2>&1 &
fi
for _ in $(seq 1 30); do curl -sf http://127.0.0.1:8222/healthz >/dev/null 2>&1 && break || sleep 1; done

# --- NATS stream + durable consumers (memory storage: recreate every boot) --
# Mirrors infra/k8s/nats-jetstream-stream-config.yaml.
log "Ensuring NATS stream and consumers..."
cfg="${DEVSTACK_DIR}/nats-config"
cat > "${cfg}/stream.json" <<'JSON'
{ "name": "booking", "subjects": ["orders.*", "tickets.*"], "description": "Booking events stream", "retention": "limits", "discard": "old", "storage": "memory", "num_replicas": 1 }
JSON
cat > "${cfg}/ticketsConsumer.json" <<'JSON'
{ "durable_name": "tickets-service-durable", "description": "Durable consumer for tickets service", "stream_name": "booking", "filter_subjects": ["orders.*"], "deliver_policy": "all", "ack_policy": "explicit", "replay_policy": "instant", "max_ack_pending": 128 }
JSON
cat > "${cfg}/ordersConsumer.json" <<'JSON'
{ "durable_name": "orders-service-durable", "description": "Durable consumer for orders service", "stream_name": "booking", "filter_subjects": ["tickets.*"], "deliver_policy": "all", "ack_policy": "explicit", "replay_policy": "instant", "max_ack_pending": 128 }
JSON
S="nats --server 127.0.0.1:4222"
$S stream add --config "${cfg}/stream.json" >/dev/null 2>&1 \
  || $S stream edit -f --config "${cfg}/stream.json" >/dev/null 2>&1 || true
$S consumer add booking --config "${cfg}/ticketsConsumer.json" >/dev/null 2>&1 || true
$S consumer add booking --config "${cfg}/ordersConsumer.json" >/dev/null 2>&1 || true

# --- nginx reverse proxy ---------------------------------------------------
log "Starting nginx reverse proxy on :${PROXY_PORT}..."
mkdir -p "${DEVSTACK_DIR}/run"
export DEVSTACK_DIR PROXY_PORT AUTH_PORT TICKETS_PORT ORDERS_PORT CLIENT_PORT
envsubst '${DEVSTACK_DIR} ${PROXY_PORT} ${AUTH_PORT} ${TICKETS_PORT} ${ORDERS_PORT} ${CLIENT_PORT}' \
  < "${SCRIPT_DIR}/nginx.conf.template" > "${DEVSTACK_DIR}/run/nginx.conf"
if [ -f "${DEVSTACK_DIR}/run/nginx.pid" ] && kill -0 "$(cat "${DEVSTACK_DIR}/run/nginx.pid")" 2>/dev/null; then
  nginx -c "${DEVSTACK_DIR}/run/nginx.conf" -s reload
else
  nginx -c "${DEVSTACK_DIR}/run/nginx.conf"
fi

log "Infra ready: postgres:5432 mongo:27017 redis:6379 nats:4222 proxy:${PROXY_PORT}"
