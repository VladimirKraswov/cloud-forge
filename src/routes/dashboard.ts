import { FastifyInstance } from 'fastify';
import { DashboardService } from '../services/dashboard.service';

export default async function dashboardRoutes(app: FastifyInstance) {
  app.get(
    '/dashboard/summary',
    {
      schema: {
        description: 'Get dashboard statistics summary',
      },
    },
    async () => {
      return DashboardService.getSummary();
    },
  );

  app.get(
    '/dashboard/active-runs',
    {
      schema: {
        description: 'Get list of created/running runs',
      },
    },
    async () => {
      return DashboardService.getActiveRuns();
    },
  );

  app.get(
    '/dashboard/active-workers',
    {
      schema: {
        description: 'Get list of online/busy workers',
      },
    },
    async () => {
      return DashboardService.getActiveWorkers();
    },
  );

  app.get(
    '/dashboard/recent-events',
    {
      schema: {
        description: 'Get list of recent terminal run status changes',
      },
    },
    async () => {
      return DashboardService.getRecentEvents();
    },
  );
}
