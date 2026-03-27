import { api, unwrap } from '@/api/client';
import type { Worker } from '@/api/types';

export const workersApi = {
  list: () => unwrap(api.get<Worker[]>('/workers')),
  get: (workerId: string) => unwrap(api.get<Worker>(`/workers/${workerId}`)),
};
