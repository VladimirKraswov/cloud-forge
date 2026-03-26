# Cloud Forge

Distributed Task Orchestration System built with Node.js, Fastify, TypeScript, SQLite, Redis, and MinIO.

## Architecture

Cloud Forge consists of two main components:

1. **Orchestrator Stack**  
   Central control plane: Fastify backend, SQLite, Redis, MinIO, REST API, WebSocket API.

2. **Worker Image**  
   A standalone publishable Docker image that executes jobs on remote machines.

## Current execution model

### MVP mode
In the current MVP phase, user code executes **directly inside the published worker container**.

That means:
- the orchestrator stores job configuration and creates runs;
- the worker downloads run config from the orchestrator;
- the worker executes Python or JavaScript code inside itself;
- logs, heartbeats, cancellation, and artifacts are sent back to the orchestrator.

### Future mode
Job definitions can already contain multiple containers, but **remote multi-container orchestration is not implemented yet**.  
Those presets are marked in the catalog as `future`.

## Features

- UI-ready REST API
- Job CRUD with validation
- Share-token based remote execution
- Live logs and run status via WebSocket
- Run artifacts in S3-compatible storage
- Dashboard endpoints
- Health checks for deployment
- Publishable worker Docker image

## Getting started

### Requirements
- Node.js 20+
- Docker & Docker Compose

### Local development

1. Install dependencies:
   ```bash
   npm install
````

2. Start infrastructure:

   ```bash
   docker compose up -d redis minio
   ```

3. Start orchestrator:

   ```bash
   npm run dev
   ```

4. Open API docs:

   ```text
   http://localhost:3000/docs
   ```

## API overview

### Jobs

* `POST /jobs` — create job template
* `GET /jobs` — list jobs with pagination/filtering
* `GET /jobs/:id` — get job details and stats
* `PATCH /jobs/:id` — update job
* `DELETE /jobs/:id` — delete job if it has no active runs
* `POST /jobs/:id/clone` — clone job
* `POST /jobs/validate` — validate job payload
* `GET /jobs/:id/runs` — paginated runs list for job

### Share tokens

* `POST /jobs/:id/share-tokens` — create remote execution token
* `GET /jobs/:id/share-tokens` — list share tokens for a job
* `GET /share-tokens/:id` — get share token details
* `POST /share-tokens/:id/revoke` — revoke token

### Dashboard

* `GET /dashboard/summary`
* `GET /dashboard/active-runs`
* `GET /dashboard/active-workers`
* `GET /dashboard/recent-events`

### Worker API

* `GET /api/run-config?token=...`
* `POST /api/runs/start`
* `POST /api/runs/heartbeat`
* `POST /api/runs/logs`
* `POST /api/runs/finish`
* `POST /api/runs/:id/cancel`
* `GET /api/runs/:id`

### WebSocket

* `WS /ws/runs/:run_id`

### Health

* `GET /health/live`
* `GET /health/ready`

## Deployment

### Orchestrator stack

Run the orchestrator stack with Docker Compose:

```bash
docker compose up -d
```

### Worker image

The worker image should be published with a **fixed version tag**.

Example:

```bash
xproger/cloud-forge-worker:0.1.0
```

Build locally:

```bash
npm run worker:build
```

Publish:

```bash
npm run worker:publish
```

## Example remote execution command

The orchestrator should return a command like:

```bash
docker run --rm \
  -e JOB_CONFIG_URL="https://your-domain/api/run-config?token=cf_xxx" \
  xproger/cloud-forge-worker:0.1.0
```