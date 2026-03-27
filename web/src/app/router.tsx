import {
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { AppShell } from '@/app/shell/app-shell';
import { RouteErrorBoundary } from '@/app/route-error-boundary';
import { DashboardPage } from '@/pages/dashboard-page';
import { JobsListPage } from '@/pages/jobs/jobs-list-page';
import { JobDetailsPage } from '@/pages/jobs/job-details-page';
import { JobEditorPage } from '@/pages/jobs/job-editor-page';
import { JobRunsPage } from '@/pages/jobs/job-runs-page';
import { JobTokensPage } from '@/pages/jobs/job-tokens-page';
import { RunDetailsPage } from '@/pages/runs/run-details-page';
import { WorkersListPage } from '@/pages/workers/workers-list-page';
import { CatalogPage } from '@/pages/catalog/catalog-page';
import { NotFoundPage } from '@/pages/not-found-page';

export interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  errorComponent: RouteErrorBoundary,
  notFoundComponent: NotFoundPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});

const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs',
  component: JobsListPage,
});

interface JobCreateSearch {
  bootstrapImageId?: string;
  templateId?: string;
  containerPresetId?: string;
}

const createJobRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs/create',
  validateSearch: (search: Record<string, unknown>): JobCreateSearch => ({
    bootstrapImageId:
      typeof search.bootstrapImageId === 'string' ? search.bootstrapImageId : undefined,
    templateId: typeof search.templateId === 'string' ? search.templateId : undefined,
    containerPresetId:
      typeof search.containerPresetId === 'string' ? search.containerPresetId : undefined,
  }),
  component: JobEditorPage,
});

const jobDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs/$jobId',
  component: JobDetailsPage,
});

const editJobRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs/$jobId/edit',
  component: JobEditorPage,
});

const jobRunsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs/$jobId/runs',
  component: JobRunsPage,
});

const jobTokensRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs/$jobId/tokens',
  component: JobTokensPage,
});

const runDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/runs/$runId',
  component: RunDetailsPage,
});

const workersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workers',
  component: WorkersListPage,
});

const catalogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/catalog',
  component: CatalogPage,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  jobsRoute,
  createJobRoute,
  jobDetailsRoute,
  editJobRoute,
  jobRunsRoute,
  jobTokensRoute,
  runDetailsRoute,
  workersRoute,
  catalogRoute,
]);

export const router = createRouter({
  routeTree,
  context: {
    queryClient: undefined as unknown as QueryClient,
  },
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
