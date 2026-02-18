#!/bin/bash

# Restore script for all databases in the booking microservices cluster
# Restores from timestamped backup directory

set -e

# Configuration
NAMESPACE="default"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Database Restore Script ===${NC}\n"

# Check if backup directory is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Backup directory not specified${NC}"
    echo -e "Usage: $0 <backup_directory>"
    echo -e "\nAvailable backups:"
    ls -d backups/*/ 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_DIR="$1"

# Verify backup directory exists
if [ ! -d "${BACKUP_DIR}" ]; then
    echo -e "${RED}Error: Backup directory '${BACKUP_DIR}' not found${NC}"
    exit 1
fi

echo -e "${BLUE}Restore directory: ${BACKUP_DIR}${NC}\n"

# Show metadata if exists
if [ -f "${BACKUP_DIR}/metadata.txt" ]; then
    echo -e "${BLUE}Backup metadata:${NC}"
    cat "${BACKUP_DIR}/metadata.txt"
    echo ""
fi

# Confirmation prompt
echo -e "${YELLOW}WARNING: This will overwrite existing database data!${NC}"
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "${confirm}" != "yes" ]; then
    echo -e "${RED}Restore cancelled${NC}"
    exit 0
fi

echo ""

# Function to restore PostgreSQL
restore_postgres() {
    local service=$1
    local db_name=$2
    local pod_name=$3
    local backup_file="${BACKUP_DIR}/${service}.sql.gz"
    
    echo -e "${GREEN}Restoring PostgreSQL: ${service}${NC}"
    
    if [ ! -f "${backup_file}" ]; then
        echo -e "${RED}✗ Backup file not found: ${backup_file}${NC}\n"
        return 1
    fi
    
    # Decompress and restore
    gunzip -c "${backup_file}" | kubectl exec -i -n "${NAMESPACE}" "${pod_name}" -- bash -c \
        "PGPASSWORD=\${POSTGRES_PASSWORD} psql -U \${POSTGRES_USER} -d ${db_name}"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ ${service} restore completed${NC}\n"
    else
        echo -e "${RED}✗ ${service} restore failed${NC}\n"
        return 1
    fi
}

# Function to restore MongoDB
restore_mongodb() {
    local service=$1
    local pod_name=$2
    local backup_file="${BACKUP_DIR}/${service}.archive.gz"
    
    echo -e "${GREEN}Restoring MongoDB: ${service}${NC}"
    
    if [ ! -f "${backup_file}" ]; then
        echo -e "${RED}✗ Backup file not found: ${backup_file}${NC}\n"
        return 1
    fi
    
    # Restore from archive
    cat "${backup_file}" | kubectl exec -i -n "${NAMESPACE}" "${pod_name}" -- mongorestore --archive --gzip --drop
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ ${service} restore completed${NC}\n"
    else
        echo -e "${RED}✗ ${service} restore failed${NC}\n"
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

# Restore all databases
restore_postgres "tickets-postgres" "tickets" "${TICKETS_POD}"
restore_postgres "orders-postgres" "orders" "${ORDERS_POD}"
restore_mongodb "auth-mongo" "${AUTH_POD}"

echo -e "${GREEN}=== Restore Complete ===${NC}"
echo -e "${YELLOW}Note: You may need to restart application pods to reconnect to databases${NC}"
echo -e "${BLUE}Run: kubectl rollout restart deployment -n ${NAMESPACE}${NC}"