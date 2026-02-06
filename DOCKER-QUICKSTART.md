# Docker Quick Start

## Start Development Container

```bash
docker compose up -d
```

Access at: `http://localhost:3000`

## View Logs

```bash
docker compose logs -f
```

## Stop Container

```bash
docker compose stop
```

## Restart Container

```bash
docker compose restart
```

## Rebuild After Code Changes

```bash
docker compose build --no-cache && docker compose up -d && docker compose logs -f
```

## Reset Database

```bash
docker compose down -v
docker compose up -d
```

## Check Status

```bash
docker compose ps
```

## Full Documentation

See [DOCKER.md](./DOCKER.md) for comprehensive guide.
