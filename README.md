# Cloud Forge

Distributed Task Orchestration System built with Node.js, Fastify, TypeScript, and SQLite.

## Features

- **Project Structure**: Modern TypeScript-first organization.
- **API Documentation**: Automatic Swagger UI at `/docs`.
- **Job Queue**: Scalable job processing using BullMQ and Redis.
- **WebSockets**: Live job status and log updates.
- **Robust Data Layer**: SQLite for storage with models for easy interaction.
- **Logging**: High-performance logging with Pino.
- **Containerization**: Ready for deployment with Docker and Docker Compose.
- **Testing**: Comprehensive tests using Vitest and Supertest.

## Getting Started

### Prerequisites

- Node.js 20+
- Redis (optional but recommended for BullMQ)
- Docker (optional)

### Local Development

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Configuration**:
    Create a `.env` file based on the provided `.env` (it is created automatically by the setup).

3.  **Run in development mode**:
    ```bash
    npm run dev
    ```

4.  **Open API Documentation**:
    Visit `http://localhost:3000/docs` in your browser.

### Scripts

- `npm run dev`: Start the server with `ts-node`.
- `npm run build`: Compile TypeScript to JavaScript.
- `npm run start`: Start the compiled production server.
- `npm run lint`: Run ESLint to check code quality.
- `npm test`: Run tests using Vitest.

## Docker

### Building images

```bash
docker build -t cloud-forge-server .
docker build -t cloud-forge-worker -f Dockerfile.worker .
```

## API Overview

### Jobs

- `POST /jobs`: Create a new task. Returns `job_id` and `run_token`.
- `GET /jobs/:id`: Get task status, result, metrics, and logs.

### Worker API

- `POST /claim`: Claim a job using a `run_token`.
- `POST /logs`: Submit log messages for a job.
- `POST /finish`: Mark a job as finished or failed with results and metrics.

### WebSockets

- `WS /ws/:job_id`: Connect to receive live status updates and logs for a specific job.
