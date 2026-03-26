# Cloud Forge Architecture

This document describes the architectural model of Cloud Forge, distinguishing between the Orchestrator Stack and the Worker Runtime.

## 1. Orchestrator Stack

The Orchestrator Stack is the central control plane of the system. It is deployed on a master server and manages job configurations, runs, tokens, and artifacts.

### Components
- **Orchestrator Backend (Fastify + TypeScript)**: Exposes the REST API and manages the database.
- **SQLite**: Primary database for metadata (Jobs, Runs, Workers, Tokens). Uses persistent volumes.
- **Redis**: Message queue for internal task distribution and watchdog coordination.
- **MinIO**: S3-compatible object storage for attached files and run artifacts.

---

## 2. Worker Runtime

The Worker is a standalone, publishable Docker image designed to run on remote machines.

### MVP Execution Model (Single-Container)
**Status: Current Implementation**
- The worker image is published to a registry (e.g., `xproger/cloud-forge-worker:0.1.0`).
- Users run jobs on remote machines using a single `docker run` command.
- **The user code executes directly inside the worker container.**
- The worker fetches the job configuration, sets up the environment, executes the code, and streams logs/artifacts back to the orchestrator.
- Limitations: Multi-container job configurations are supported in the API but the worker only executes the code in its own container.

### Future Execution Model (Multi-Container)
**Status: Roadmap**
- The worker will evolve into a **Local Executor**.
- It will act as a mini-orchestrator on the remote host.
- It will use the Docker Socket (`/var/run/docker.sock`) to pull and start additional containers defined in the Job configuration.
- It will manage a local network and lifecycle for these child containers.

---

## 3. Remote Execution Flow

1. **Create Job**: Define code, language, and environment.
2. **Share Job**: Generate a `ShareToken`. The orchestrator provides a `docker run` command.
3. **Execute**: Run the command on a remote machine.
   ```bash
   docker run --rm -e JOB_CONFIG_URL="https://forge.example.com/api/run-config?token=cf_..." xproger/cloud-forge-worker:0.1.0