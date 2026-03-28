# Cloud Forge Web UI

Production-oriented frontend for Cloud Forge.

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- shadcn/ui-style primitives
- TanStack Router
- TanStack Query
- React Hook Form + Zod
- Recharts
- Sonner toasts

## Environment

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Example:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

## Install

```bash
npm install
```

## Run in development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Lint

```bash
npm run lint
```

## Backend integration notes

The frontend is wired against these backend shapes:

- `GET /dashboard/summary`
- `GET /dashboard/active-runs`
- `GET /dashboard/active-workers`
- `GET /dashboard/recent-events`
- `GET /jobs`
- `GET /jobs/:id`
- `POST /jobs`
- `PATCH /jobs/:id`
- `DELETE /jobs/:id`
- `POST /jobs/:id/clone`
- `GET /jobs/:id/runs`
- `GET /jobs/:id/share-tokens`
- `POST /jobs/:id/share-tokens`
- `GET /share-tokens/:id`
- `POST /share-tokens/:id/revoke`
- `GET /workers`
- `GET /workers/:id`
- `GET /catalog/job-templates`
- `GET /catalog/container-presets`
- `POST /artifacts/upload-job?jobId=:jobId`
- `GET /api/runs/:id`
- `POST /api/runs/:id/cancel`
- `WS /ws/runs/:run_id`

## Notes

- Run details consume logs and artifacts from `GET /api/runs/:id`.
- Job file uploads are done after job create/update through the artifact upload endpoint.
- Share token details dialog will render generated worker/docker commands if the backend returns them.
- If you later add a direct “run now” HTTP endpoint, the UI structure is ready to attach a dedicated mutation.
