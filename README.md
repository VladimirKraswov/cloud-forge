# Cloud Forge

Distributed Task Orchestration System built with Node.js, Fastify, TypeScript, SQLite, Redis, and MinIO.

## Project Structure

The project is organized as a monorepo using NPM workspaces:

- `apps/backend`: Fastify orchestrator API and business logic.
- `apps/web`: React/Vite frontend application.
- `apps/worker`: Standalone Python-based job runner.
- `infra/compose`: Docker Compose configurations for development and production.
- `infra/deploy`: Helper scripts for deployment.

## Architecture

Cloud Forge consists of three main deployable units:

1. **Backend (Orchestrator)**
   Central control plane: API, job management, run tracking, and bootstrap image building.
2. **Web (Frontend)**
   User interface for managing jobs, runs, and workers.
3. **Worker Runtime**
   A standalone Docker image that executes jobs on remote machines.

## Getting Started

### Local Development

1. Install dependencies at the root:
   ```bash
   npm install
   ```

2. Start infrastructure (Redis, MinIO) and the backend/web in development mode:
   ```bash
   # Start Redis and MinIO
   docker compose -f infra/compose/docker-compose.dev.yml up -d redis minio

   # Start backend (defaults to http://localhost:3000)
   npm run dev:backend

   # Start web (defaults to http://localhost:5173)
   npm run dev:web
   ```

3. Open the web interface at `http://localhost:5173`.
4. API documentation is available at `http://localhost:3000/docs`.

### Building Services

#### Backend
```bash
npm run build:backend
# Or via Docker
docker build -t cloud-forge-backend -f apps/backend/Dockerfile apps/backend
```

#### Web
```bash
npm run build:web
# Or via Docker
docker build -t cloud-forge-web -f apps/web/Dockerfile apps/web
```

#### Worker
```bash
# Using the root script
npm run build:worker
# Or via the dedicated publish script in the worker app
./apps/worker/scripts/publish-worker.sh --version 0.1.0 --single-platform
```

## Production Deployment

This project is designed to be deployed on a single server using **Docker Compose** and **Nginx Proxy Manager** (NPM) as a reverse proxy.

### 1. Preparation

Copy the `.env.example` files to `.env` in `apps/backend` and `apps/web` and configure them for your production environment.

Key environment variables for production:
- `PUBLIC_BASE_URL=https://api.cloud-forge.ru` (Backend)
- `VITE_API_BASE_URL=https://api.cloud-forge.ru` (Web)

### 2. Deployment with Docker Compose

Use the production compose file:

```bash
docker compose -f infra/compose/docker-compose.prod.yml up -d
```

### 3. Nginx Proxy Manager Setup

Configure two Proxy Hosts in Nginx Proxy Manager:

1. **cloud-forge.ru**
   - Forward Hostname: `web`
   - Forward Port: `80`
   - Enable SSL (Let's Encrypt)
   - Enable Websockets Support

2. **api.cloud-forge.ru**
   - Forward Hostname: `backend`
   - Forward Port: `3000`
   - Enable SSL (Let's Encrypt)
   - Enable Websockets Support (required for live logs)

### 4. Database

Currently, the system uses SQLite stored in `infra/compose/sqlite-data`. For high-availability production, a migration to Postgres is recommended in the future.

## CI/CD

GitHub Actions are configured in `.github/workflows/` for:
- Publishing the Worker image to Docker Hub.
- (Recommended) Add workflows for Backend and Web image builds.
