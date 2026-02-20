# Database Backup and Restore Scripts

Scripts for backing up and restoring PostgreSQL and MongoDB databases in the booking microservices Kubernetes cluster.

## Prerequisites

- `kubectl` configured with access to the cluster
- Bash shell (Linux/macOS or WSL on Windows)
- Sufficient disk space for backups

## Backup Script

### Usage

```bash
# Make script executable
chmod +x scripts/backup-databases.sh

# Run backup
./scripts/backup-databases.sh
```

### What it does

1. Creates timestamped backup directory: `backups/YYYYMMDD_HHMMSS/`
2. Backs up all PostgreSQL databases:
   - `tickets-postgres` → `tickets-postgres.sql.gz`
   - `orders-postgres` → `orders-postgres.sql.gz`
3. Backs up MongoDB:
   - `auth-mongo` → `auth-mongo.archive.gz`
4. Creates `metadata.txt` with backup information

### Output

```
backups/
└── 20260218_143022/
    ├── tickets-postgres.sql.gz
    ├── orders-postgres.sql.gz
    ├── auth-mongo.archive.gz
    └── metadata.txt
```

## Restore Script

### Usage

```bash
# Make script executable
chmod +x scripts/restore-databases.sh

# List available backups
ls -d backups/*/

# Restore from specific backup
./scripts/restore-databases.sh backups/20260218_143022
```

### What it does

1. Validates backup directory exists
2. Shows backup metadata and confirmation prompt
3. Restores all databases from backup files
4. PostgreSQL: Uses `--clean --if-exists` flags (drops existing objects)
5. MongoDB: Uses `--drop` flag (drops collections before restore)

### Safety Features

- Requires explicit `yes` confirmation before restoring
- Validates backup files exist before attempting restore
- Shows detailed progress and error messages

## Troubleshooting

### Pod not found errors

Check if pods are running:
```bash
kubectl get pods -l app=tickets-postgres
kubectl get pods -l app=orders-postgres
kubectl get pods -l app=auth-mongo
```

### Permission errors

Ensure the scripts are executable:
```bash
chmod +x scripts/*.sh
```

### Connection errors

Verify you're connected to the correct Kubernetes context:
```bash
kubectl config current-context
```

### After restore

Restart application deployments to reconnect:
```bash
kubectl rollout restart deployment auth-depl
kubectl rollout restart deployment tickets-depl
kubectl rollout restart deployment orders-depl
```

## Automation

### Scheduled backups with cron

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/project && ./scripts/backup-databases.sh >> logs/backup.log 2>&1
```

### Cleanup old backups

```bash
# Keep only last 7 days of backups
find backups/ -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \;
```

## Notes

- Backups are compressed with gzip to save space
- PostgreSQL backups use `pg_dump` with `--clean --if-exists` for safe restores
- MongoDB backups use `mongodump --archive --gzip` for compact single-file backups
- Default namespace is `default` - modify `NAMESPACE` variable if needed
- Database credentials are read from environment variables in pods (no hardcoded passwords)