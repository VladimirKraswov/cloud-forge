# Cloud Forge

Distributed Task Orchestration System built with Node.js, Fastify, TypeScript, and SQLite.

## Architecture

Cloud Forge consists of two main components:

1.  **Orchestrator Stack**: The central control plane (Backend, Redis, MinIO, SQLite). Manages jobs, runs, and worker coordination.
2.  **Worker Image**: A standalone, publishable Docker image that executes jobs on remote machines.

### MVP Execution Model
In the current MVP phase, user code executes **directly inside the worker container**. While Job configurations support multiple containers, the worker does not yet orchestrate them on the remote host. This is planned for the "Future Mode" phase.

## Features

- **UI-Ready API**: Comprehensive CRUD for jobs, paginated lists, and dashboard statistics.
- **Remote Execution**: Secure job claiming via share tokens.
- **Live Monitoring**: Heartbeats, logs, and status updates via WebSockets.
- **Artifact Management**: S3-compatible storage for persistent run outputs.
- **Health Checks**: Live and Ready probes for orchestration stack reliability.

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose

### Local Development

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Run Infrastructure**:
    ```bash
    docker compose up -d redis minio
    ```

3.  **Run Orchestrator**:
    ```bash
    npm run dev
    ```

4.  **Open Documentation**:
    Visit `http://localhost:3000/docs`.

## API Overview

### Jobs CRUD
- `POST /jobs`: Create a job template.
- `GET /jobs`: List jobs (paginated, searchable).
- `GET /jobs/:id`: Get job details and counters.
- `PATCH /jobs/:id`: Update job configuration.
- `DELETE /jobs/:id`: Delete job (allowed only if no active runs).
- `POST /jobs/:id/clone`: Create a copy of a job.
- `POST /jobs/validate`: Dry-run validation of a job payload.

### Share Tokens
- `POST /jobs/:id/share-tokens`: Create a token for remote execution.
- `GET /jobs/:id/share-tokens`: List tokens for a job.
- `GET /share-tokens/:id`: Get token details and remote run command.
- `POST /share-tokens/:id/revoke`: Revoke a token.

### Dashboard
- `GET /dashboard/summary`: System-wide statistics.
- `GET /dashboard/active-runs`: Currently executing tasks.
- `GET /dashboard/active-workers`: Online worker status.
- `GET /dashboard/recent-events`: Feed of recent terminal run changes.

### Worker API
- `GET /api/run-config?token=...`: Claim a run and fetch full configuration.
- `POST /api/runs/start`: Notify run start.
- `POST /api/runs/heartbeat`: Send heartbeat and check for stop requests.
- `POST /api/runs/logs`: Stream execution logs.
- `POST /api/runs/finish`: Finalize run with status and metrics.
- `GET /api/runs/:id`: Get detailed run history, logs, and artifacts.

### WebSockets
- `WS /ws/runs/:run_id`: Real-time logs and status updates.

## Docker & Deployment

### Orchestrator Stack
Deploy the full orchestration stack using Docker Compose:
```bash
docker compose up -d
```

### Worker Image
Build and publish the worker image:
```bash
npm run worker:build
npm run worker:publish
```
