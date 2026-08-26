#!/usr/bin/env bash
# Map the hardcoded Kubernetes service hostnames to localhost so the services
# (which connect to e.g. tickets-postgres-srv:5432, nats-jetstream-srv:4222)
# work on a single host. Idempotent.
set -euo pipefail
MARKER="booking-dev-hosts"
LINE="127.0.0.1 tickets-postgres-srv orders-postgres-srv nats-jetstream-srv auth-mongo-srv orders-redis-srv # ${MARKER}"
if ! grep -q "${MARKER}" /etc/hosts 2>/dev/null; then
  echo "${LINE}" | sudo tee -a /etc/hosts >/dev/null
fi
