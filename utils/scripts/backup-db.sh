#!/bin/bash

# Backup script for all databases in the booking microservices cluster
# Creates timestamped backups of PostgreSQL and MongoDB databases

set -e

# Configuration
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
NAMESPACE="default"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Database Backup Script ===${NC}"
echo -e "${BLUE}Backup directory: ${BACKUP_DIR}${NC}\n"

# Create backup directory
mkdir -p "${BACKUP_DIR}"

# Function to backup PostgreSQL
backup_postgres() {
    local service=$1
    local db_name=$2
    local pod_name=$3
    
    echo -e "${GREEN}Backing up PostgreSQL: ${service}${NC}"
    
    kubectl exec -n "${NAMESPACE}" "${pod_name}" -- bash -c \
        "PGPASSWORD=\${POSTGRES_PASSWORD} pg_dump -U \${POSTGRES_USER} -d ${db_name} --clean --if-exists" \
        > "${BACKUP_DIR}/${service}.sql"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ ${service} backup completed${NC}"
        gzip "${BACKUP_DIR}/${service}.sql"
        echo -e "${GREEN}✓ Compressed to ${service}.sql.gz${NC}\n"
    else
        echo -e "${RED}✗ ${service} backup failed${NC}\n"
        return 1
    fi
}

# Function to backup MongoDB
backup_mongodb() {
    local service=$1
    local pod_name=$2
    
    echo -e "${GREEN}Backing up MongoDB: ${service}${NC}"
    
    # Create dump inside pod
    kubectl exec -n "${NAMESPACE}" "${pod_name}" -- mongodump --archive --gzip > "${BACKUP_DIR}/${service}.archive.gz"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ ${service} backup completed${NC}\n"
    else
        echo -e "${RED}✗ ${service} backup failed${NC}\n"
        return 1
    fi
}

# Get pod names
echo -e "${BLUE}Discovering database pods...${NC}\n"

TICKETS_POD=$(kubectl get pod -n "${NAMESPACE}" -l app=tickets-postgres -o jsonpath='{.items[0].metadata.name}')
ORDERS_POD=$(kubectl get pod -n "${NAMESPACE}" -l app=orders-postgres -o jsonpath='{.items[0].metadata.name}')
AUTH_POD=$(kubectl get pod -n "${NAMESPACE}" -l app=auth-mongo -o jsonpath='{.items[0].metadata.name}')

# Verify pods exist
if [ -z "$TICKETS_POD" ]; then
    echo -e "${RED}✗ Tickets PostgreSQL pod not found${NC}"
    exit 1
fi

if [ -z "$ORDERS_POD" ]; then
    echo -e "${RED}✗ Orders PostgreSQL pod not found${NC}"
    exit 1
fi

if [ -z "$AUTH_POD" ]; then
    echo -e "${RED}✗ Auth MongoDB pod not found${NC}"
    exit 1
fi

# Backup all databases
backup_postgres "tickets-postgres" "tickets" "${TICKETS_POD}"
backup_postgres "orders-postgres" "orders" "${ORDERS_POD}"
backup_mongodb "auth-mongo" "${AUTH_POD}"

# Create metadata file
cat > "${BACKUP_DIR}/metadata.txt" << EOF
Backup Date: $(date)
Namespace: ${NAMESPACE}
Databases:
  - tickets-postgres (PostgreSQL)
  - orders-postgres (PostgreSQL)
  - auth-mongo (MongoDB)

Pods:
  - Tickets: ${TICKETS_POD}
  - Orders: ${ORDERS_POD}
  - Auth: ${AUTH_POD}
EOF

echo -e "${GREEN}=== Backup Complete ===${NC}"
echo -e "${GREEN}Backups saved to: ${BACKUP_DIR}${NC}"
echo -e "${GREEN}Files:${NC}"
ls -lh "${BACKUP_DIR}"