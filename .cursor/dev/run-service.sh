#!/usr/bin/env bash
# Run one backend service (auth|tickets|orders) as a foreground dev server.
#
# Loads the shared dev env, then launches the service's watch-mode entrypoint
# with the port-override preload so the hardcoded Bun.serve({port:3000}) listens
# on the per-service dev port instead. Used by the `terminals` in environment.json.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export REPO_ROOT
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/env.sh"

service="${1:?usage: run-service.sh <auth|tickets|orders>}"
case "${service}" in
  auth)    export PORT="${AUTH_PORT}" ;;
  tickets) export PORT="${TICKETS_PORT}" ;;
  orders)  export PORT="${ORDERS_PORT}" ;;
  *) echo "unknown service: ${service}" >&2; exit 1 ;;
esac

cd "${REPO_ROOT}/apps/${service}"
exec bun --watch --preload "${PORT_OVERRIDE_PRELOAD}" src/index.ts
