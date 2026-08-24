#!/usr/bin/env bash
# Run the Next.js client dev server (used by the `terminals` in environment.json).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
export REPO_ROOT
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/env.sh"

cd "${REPO_ROOT}/apps/client"
exec bun run next dev -p "${CLIENT_PORT}" -H 0.0.0.0
