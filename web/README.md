# Cloud Forge Web UI

Modern React-based dashboard for Cloud Forge Orchestrator.

## Tech Stack

- **Framework**: React 19
- **Bundler**: Vite
- **Routing**: TanStack Router
- **State Management**: TanStack Query (Server State)
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui (Radix Primitives)
- **Forms**: React Hook Form + Zod
- **Icons**: Lucide React
- **Charts**: Recharts

## Getting Started

### Prerequisites

- Node.js 20+
- Backend running (usually on port 3000)

### Installation

```bash
cd web
npm install
```

### Development

```bash
npm run dev
```

The UI will be available at `http://localhost:5173`.
Make sure to configure `.env` if your backend is not at `http://localhost:3000`.

### Production Build

```bash
npm run build
npm run preview
```

## Project Structure

- `src/api`: Centralized API client and type definitions.
- `src/app`: Application shell, layout, and router configuration.
- `src/pages`: Individual page components (Dashboard, Jobs, Workers, etc.).
- `src/shared`: Reusable UI components, utilities, and hooks.
- `src/features`: Complex business logic modules (to be expanded).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:3000` | Backend API URL |
| `VITE_WS_BASE_URL` | `ws://localhost:3000` | Backend WebSocket URL |
