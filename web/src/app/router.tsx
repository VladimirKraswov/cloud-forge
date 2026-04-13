import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { Layout } from './layout';
import { DashboardPage } from '@/pages/dashboard';
import { JobsListPage } from '@/pages/jobs';
import { JobDetailsPage } from '@/pages/job-details';
import { JobEditorPage } from '@/pages/job-editor';
import { RunDetailsPage } from '@/pages/run-details';
import { WorkersPage } from '@/pages/workers';
import { CatalogPage } from '@/pages/catalog';

const rootRoute = createRootRoute({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});

const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs',
  component: JobsListPage,
});

const jobDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs/$jobId',
  component: JobDetailsPage,
});

const jobEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs/edit/$jobId',
  component: JobEditorPage,
});

const jobCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs/create',
  component: JobEditorPage,
});

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/runs/$runId',
  component: RunDetailsPage,
});

const workersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workers',
  component: WorkersPage,
});

const catalogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/catalog',
  component: CatalogPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  jobsRoute,
  jobDetailsRoute,
  jobEditorRoute,
  jobCreateRoute,
  runsRoute,
  workersRoute,
  catalogRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
