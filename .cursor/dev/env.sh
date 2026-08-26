# Shared development environment variables for the booking monorepo.
#
# Sourced by the install/start scripts and by each service's run command. Every
# value uses `: "${VAR:=default}"` so that real secrets injected into the Cloud
# Agent (e.g. GOOGLE_CLIENT_ID, ORDERS_STRIPE_SECRET_KEY) take precedence over
# these non-secret local defaults. Nothing secret belongs in this file.

# Repo + tooling
export REPO_ROOT="${REPO_ROOT:-/workspace}"
export PATH="$HOME/.bun/bin:/usr/lib/postgresql/18/bin:/usr/local/bin:$PATH"

# Shared auth secret (all services verify the same session cookie).
: "${JWT_KEY:=dev-jwt-secret-change-me}"

# --- Auth service (MongoDB + Google OAuth) ---
: "${MONGO_URI:=mongodb://auth-mongo-srv:27017/auth}"
# Placeholder Google OAuth config so the service boots. Real Google sign-in
# requires providing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI
# (and their NEXT_PUBLIC_ counterparts) as Cloud Agent secrets.
: "${GOOGLE_CLIENT_ID:=dev-google-client-id.apps.googleusercontent.com}"
: "${GOOGLE_CLIENT_SECRET:=dev-google-client-secret}"
: "${GOOGLE_REDIRECT_URI:=http://localhost:8080/api/auth/google-callback}"
# bcrypt("admin123") — dev password for POST /api/auth/create-admin.
: "${AUTH_CREATE_ADMIN_HASH:=\$2b\$10\$plWBlsgpIYk72J5cvgYz.emazkPw9FTOr/hjpEEcRQSXDxR.CtIxy}"

# --- Tickets service (Postgres) ---
: "${TICKETS_POSTGRES_USER:=tickets}"
: "${TICKETS_POSTGRES_PASSWORD:=tickets}"
: "${TICKETS_POSTGRES_DB:=tickets}"

# --- Orders service (Postgres + Redis + Stripe) ---
: "${ORDERS_POSTGRES_USER:=orders}"
: "${ORDERS_POSTGRES_PASSWORD:=orders}"
: "${ORDERS_POSTGRES_DB:=orders}"
: "${REDIS_HOST:=orders-redis-srv}"
# Placeholder Stripe config so the service boots. Real payments require providing
# ORDERS_STRIPE_SECRET_KEY / ORDERS_STRIPE_WEBHOOK_SECRET as Cloud Agent secrets.
: "${ORDERS_STRIPE_SECRET_KEY:=sk_test_placeholder}"
: "${ORDERS_STRIPE_WEBHOOK_SECRET:=whsec_placeholder}"

# --- Client (Next.js) ---
# Browser-facing origin (path-routed by the nginx proxy).
: "${NEXT_PUBLIC_BASE_URL:=http://localhost:8080}"
# Server-side rendering fetches use these (mirrors the in-cluster ingress URL).
: "${INTERNAL_BASE_URL:=http://localhost:8080}"
: "${INTERNAL_HOST:=localhost}"
: "${NEXT_PUBLIC_GOOGLE_CLIENT_ID:=${GOOGLE_CLIENT_ID}}"
: "${NEXT_PUBLIC_GOOGLE_REDIRECT_URI:=${GOOGLE_REDIRECT_URI}}"
: "${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:=pk_test_placeholder}"

# --- Ports (single-host layout; the nginx proxy mirrors the k8s ingress) ---
: "${AUTH_PORT:=3001}"
: "${TICKETS_PORT:=3002}"
: "${ORDERS_PORT:=3003}"
: "${CLIENT_PORT:=3000}"
: "${PROXY_PORT:=8080}"

# Bun preload that lets PORT override the hardcoded Bun.serve port.
export PORT_OVERRIDE_PRELOAD="${REPO_ROOT}/.cursor/dev/port-override.ts"

# Local data + logs for the infra services started by start.sh.
export DEVSTACK_DIR="${DEVSTACK_DIR:-$HOME/booking-devstack}"

export JWT_KEY MONGO_URI GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REDIRECT_URI \
  AUTH_CREATE_ADMIN_HASH TICKETS_POSTGRES_USER TICKETS_POSTGRES_PASSWORD \
  TICKETS_POSTGRES_DB ORDERS_POSTGRES_USER ORDERS_POSTGRES_PASSWORD ORDERS_POSTGRES_DB \
  REDIS_HOST ORDERS_STRIPE_SECRET_KEY ORDERS_STRIPE_WEBHOOK_SECRET \
  NEXT_PUBLIC_BASE_URL INTERNAL_BASE_URL INTERNAL_HOST NEXT_PUBLIC_GOOGLE_CLIENT_ID \
  NEXT_PUBLIC_GOOGLE_REDIRECT_URI NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
  AUTH_PORT TICKETS_PORT ORDERS_PORT CLIENT_PORT PROXY_PORT
