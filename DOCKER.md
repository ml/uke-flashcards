# Docker Deployment Guide for UKE Flashcards

This guide explains how to deploy UKE Flashcards using Docker and Docker Compose.

## Overview

UKE Flashcards is containerized using Alpine Linux for minimal image size (~350-450MB). The Docker setup handles:

- **Multi-stage build** for optimized image layers
- **Native module compilation** for better-sqlite3
- **Non-root user** for security
- **Volume persistence** for SQLite database
- **Health checks** for container monitoring
- **Next.js standalone output** for reduced bundle size

## Prerequisites

- Docker Engine (version 20.10+)
- Docker Compose v2 (included with Docker Desktop on macOS/Windows)
- WSL2 on Windows with Docker Desktop configured

## Quick Start

### Build the Docker Image

```bash
docker compose build
```

This creates an image named `uke-flashcards:latest` (~350-450MB).

**Build time:** 2-4 minutes on first build
**Build time (cached):** 30-60 seconds for subsequent builds

### Start the Container

```bash
docker compose up -d
```

This:
- Starts the `uke-flashcards` service in daemon mode
- Exposes port 3000 on `localhost`
- Creates a named volume `uke-flashcards_uke-data` for database persistence
- Enables automatic restarts on system reboot

### Verify the Deployment

```bash
# Check container status
docker compose ps

# View logs
docker compose logs -f

# Test API endpoint
curl http://localhost:3000/api/questions | head -c 100

# Check health status
docker inspect --format='{{.State.Health.Status}}' uke-flashcards

# Open in browser
# Windows: Start -> Chrome/Firefox -> http://localhost:3000
# WSL/Linux: http://localhost:3000
```

## Docker Compose Operations

### View Logs

```bash
# Stream logs in real-time
docker compose logs -f

# View last 50 lines
docker compose logs --tail=50

# View logs from specific time
docker compose logs --since 2m
```

### Stop the Container

```bash
# Stop gracefully (allows 10s shutdown)
docker compose stop

# Stop with timeout
docker compose stop -t 30

# Stop and remove containers (keeps volumes)
docker compose down

# Stop and remove everything including volumes
docker compose down -v
```

### Restart the Container

```bash
# Restart the service
docker compose restart

# Restart and tail logs
docker compose restart && docker compose logs -f
```

### Update and Rebuild

```bash
# Rebuild image with latest code
docker compose build --no-cache

# Start with rebuilt image
docker compose up -d

# One-liner for full update
docker compose build --no-cache && docker compose up -d && docker compose logs -f
```

## Data Persistence

### Database Location

- **In container:** `/app/data/uke-flashcards.db`
- **On host:** Managed by Docker named volume `uke-flashcards_uke-data`
- **Backup location:** Use `docker cp` (see below)

### Backup Database

```bash
# Backup database to host machine
docker cp uke-flashcards:/app/data/uke-flashcards.db ./uke-flashcards.db.backup

# Check backup
ls -lh ./uke-flashcards.db.backup
```

### Restore Database

```bash
# Stop the container
docker compose stop

# Restore from backup
docker cp ./uke-flashcards.db.backup uke-flashcards:/app/data/uke-flashcards.db

# Restart
docker compose restart
```

### Delete Database (Reset Progress)

```bash
# Remove the volume
docker compose down -v

# Restart - creates fresh database
docker compose up -d
```

### View Database Files

```bash
# List files in volume (requires running container)
docker exec uke-flashcards ls -lah /app/data/

# Expected output:
# uke-flashcards.db     - Main database
# uke-flashcards.db-wal - Write-Ahead Log (for crash recovery)
# uke-flashcards.db-shm - Shared memory (WAL coordination)
```

## Performance Characteristics

### Startup

- Cold start: 3-5 seconds
- Health check: 5 second grace period, then every 30 seconds
- Ready for requests: ~2 seconds after container starts

### Runtime

- **Memory:** 100-150MB idle
- **CPU:** <1% idle, spikes to 5-15% during question fetching
- **Disk:** ~350MB image + database

### API Response Times

- `/api/questions` - ~10ms (cached in memory)
- `/api/sessions` - ~5ms (SQLite query)
- `/api/attempts/[id]` - ~15ms (with database write)

## Network Access

### From WSL/Linux

```bash
curl http://localhost:3000
```

### From Windows (Host Machine)

WSL2 automatically bridges networking, so use the same address:

```powershell
# PowerShell on Windows
curl http://localhost:3000

# Or open in browser
Start-Process "http://localhost:3000"
```

### From Other Machines on Network

```bash
# Replace <YOUR-WSL-IP> with output of: wsl hostname -I
curl http://<YOUR-WSL-IP>:3000

# Example: curl http://192.168.1.100:3000
```

## Container Configuration

### Environment Variables

Set in `docker-compose.yml`:

```yaml
environment:
  NODE_ENV: production      # Next.js production mode
  PORT: 3000              # Internal port (do not change)
  HOSTNAME: 0.0.0.0        # Listen on all interfaces
```

### Port Mapping

```yaml
ports:
  - "3000:3000"  # Host:Container - Change left side to use different port
```

To use a different port (e.g., 8080):

```yaml
ports:
  - "8080:3000"
```

Then access at `http://localhost:8080`

### Volume Configuration

```yaml
volumes:
  - uke-data:/app/data  # Named volume for persistence
```

Data in `/app/data` inside the container persists across container restarts.

## Troubleshooting

### Container Exits Immediately

**Symptom:** `docker compose ps` shows `Exited`

**Solution:**

```bash
# Check logs for error
docker compose logs

# Verify Next.js standalone output
# Make sure next.config.mjs has: output: 'standalone'

# Rebuild
docker compose build --no-cache
docker compose up
```

### Can't Access from Browser

**Symptom:** `http://localhost:3000` shows "connection refused"

**Solution:**

```bash
# Verify container is running
docker compose ps  # Status should be "Up"

# Check if port 3000 is in use
netstat -tlnp | grep 3000
lsof -i :3000  # macOS

# Try curl first
curl http://localhost:3000

# Check logs
docker compose logs | tail -20
```

### Database Errors

**Symptom:** "Database locked" or SQLite errors in logs

**Solution:**

```bash
# Check volume mount
docker inspect uke-flashcards | grep -A 10 Mounts

# Check permissions
docker exec uke-flashcards ls -la /app/data/

# Verify volume exists
docker volume ls | grep uke-data

# Restart container
docker compose restart
```

### Health Check Failing

**Symptom:** `docker inspect` shows health status "unhealthy"

**Solution:**

```bash
# Check if API is responding
curl http://localhost:3000/api/questions

# View health check logs
docker inspect uke-flashcards | grep -A 10 '"Health"'

# Try with verbose curl
curl -v http://localhost:3000/api/questions

# Restart
docker compose restart
```

### Build Failures

**Symptom:** `docker compose build` fails during `npm install` or `npm run build`

**Solution:**

```bash
# Clear Docker cache
docker compose build --no-cache

# Check Docker disk space
docker system df

# Clean up unused images/containers
docker system prune -a

# View full build output
docker compose build --progress=plain
```

## Advanced Configuration

### Custom Image Name

Edit `docker-compose.yml`:

```yaml
services:
  uke-flashcards:
    image: my-registry/uke-flashcards:1.0.0
```

### Multiple Instances

```bash
# Run second instance on different port
docker run -d \
  -p 3001:3000 \
  -v uke-data-2:/app/data \
  --name uke-flashcards-2 \
  uke-flashcards:latest
```

### CPU/Memory Limits

Edit `docker-compose.yml`:

```yaml
services:
  uke-flashcards:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### Log Rotation

Edit `docker-compose.yml`:

```yaml
services:
  uke-flashcards:
    logging:
      driver: json-file
      options:
        max-size: "100m"
        max-file: "3"
```

## Production Deployment

### Docker Swarm

```bash
# Initialize swarm
docker swarm init

# Deploy service
docker stack deploy -c docker-compose.yml uke-app

# View service status
docker service ls
docker service ps uke-app_uke-flashcards
```

### Kubernetes

Convert to Kubernetes manifests:

```bash
# Using kompose (install from kompose.io)
kompose convert -f docker-compose.yml

# Review and customize generated manifests
kubectl apply -f uke-flashcards-deployment.yaml
kubectl apply -f uke-data-persistentvolumeclaim.yaml
kubectl apply -f uke-flashcards-service.yaml
```

### Monitoring

```bash
# View container stats in real-time
docker stats uke-flashcards

# View process list inside container
docker exec uke-flashcards ps aux

# View network connections
docker exec uke-flashcards netstat -tlnp
```

## Cleanup

### Remove Container (Keep Volume)

```bash
docker compose down
```

### Complete Cleanup (Remove Everything)

```bash
docker compose down -v --remove-orphans
```

### Clean Up All Docker Resources

```bash
# Remove stopped containers
docker container prune

# Remove dangling images
docker image prune

# Remove unused volumes
docker volume prune

# Full system cleanup
docker system prune -a
```

## Files Reference

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build configuration |
| `docker-compose.yml` | Service orchestration and volume setup |
| `.dockerignore` | Build context filtering |
| `next.config.mjs` | Contains `output: 'standalone'` setting |
| `data/questions.json` | Question database (baked into image) |
| `data/alphabet.json` | Alphabet reference (baked into image) |
| `data/q_codes.json` | Q-codes reference (baked into image) |

## Summary

| Task | Command |
|------|---------|
| Build image | `docker compose build` |
| Start container | `docker compose up -d` |
| View logs | `docker compose logs -f` |
| Stop container | `docker compose stop` |
| Restart | `docker compose restart` |
| Check status | `docker compose ps` |
| Backup database | `docker cp uke-flashcards:/app/data/uke-flashcards.db ./backup.db` |
| Full cleanup | `docker compose down -v` |

## Questions?

- Check logs: `docker compose logs`
- Verify health: `docker inspect --format='{{.State.Health.Status}}' uke-flashcards`
- Test API: `curl http://localhost:3000/api/questions`
