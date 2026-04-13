import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export type ExecutionLanguage = 'python' | 'javascript';
export type RunStatus = 'created' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'lost';
export type WorkerStatus = 'online' | 'busy' | 'offline';

export interface Container {
  name: string;
  image: string;
  is_parent?: boolean;
  resources?: {
    gpus?: string;
    shm_size?: string;
    cpu_limit?: number;
    memory_limit?: string;
  };
  env?: Record<string, string>;
}

export interface AttachedFile {
  id: string;
  filename: string;
  size_bytes: number;
  storage_key: string;
  mime_type: string;
}

export interface Job {
  id: string;
  title: string;
  description?: string | null;
  containers: Container[];
  environments: Record<string, string>;
  attached_files: AttachedFile[];
  execution_code: string;
  execution_language: ExecutionLanguage;
  entrypoint?: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobListItem extends Job {
  latest_run_status?: RunStatus | null;
  latest_run_at?: string | null;
  runs_count: number;
  active_runs_count: number;
}

export interface RunState {
  status: RunStatus;
  started_at?: string | null;
  finished_at?: string | null;
  exit_code?: number | null;
  error?: string | null;
}

export interface Run {
  id: string;
  job_id: string;
  job_title?: string;
  job_language?: ExecutionLanguage;
  worker_id?: string | null;
  worker_name?: string | null;
  created_at: string;
  trigger_source?: string;
  state: RunState;
  metrics?: any;
  logs?: any[];
  artifacts?: any[];
}

export interface Worker {
  id: string;
  name: string;
  status: WorkerStatus;
  last_seen_at?: string | null;
  capabilities?: any;
}

export interface DashboardSummary {
  jobs_total: number;
  runs_total: number;
  runs_by_status: Record<RunStatus, number>;
  workers_online: number;
  workers_total: number;
}

export const jobsApi = {
  list: (params?: any) => api.get<{ jobs: JobListItem[]; total: number }>('/jobs', { params }).then(r => r.data),
  get: (id: string) => api.get<Job>(`/jobs/${id}`).then(r => r.data),
  create: (data: any) => api.post<Job>('/jobs', data).then(r => r.data),
  update: (id: string, data: any) => api.patch(`/jobs/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/jobs/${id}`).then(r => r.data),
  clone: (id: string) => api.post<Job>(`/jobs/${id}/clone`).then(r => r.data),
  getRuns: (id: string, params?: any) => api.get<Run[]>(`/jobs/${id}/runs`, { params }).then(r => r.data),
};

export const runsApi = {
  get: (id: string) => api.get<Run>(`/runs/${id}`).then(r => r.data),
  getLogs: (id: string) => api.get<any[]>(`/runs/${id}/logs`).then(r => r.data),
  cancel: (id: string) => api.post(`/runs/${id}/cancel`).then(r => r.data),
};

export const dashboardApi = {
  getSummary: () => api.get<DashboardSummary>('/dashboard/summary').then(r => r.data),
  getActiveRuns: () => api.get<Run[]>('/dashboard/active-runs').then(r => r.data),
  getActiveWorkers: () => api.get<Worker[]>('/dashboard/active-workers').then(r => r.data),
  getRecentEvents: () => api.get<any[]>('/dashboard/recent-events').then(r => r.data),
};

export const workersApi = {
  list: () => api.get<Worker[]>('/workers').then(r => r.data),
};

export const tokensApi = {
  list: (jobId: string) => api.get<any[]>(`/jobs/${jobId}/share-tokens`).then(r => r.data),
  create: (jobId: string, data: any) => api.post(`/jobs/${jobId}/share-tokens`, data).then(r => r.data),
  revoke: (id: string) => api.post(`/share-tokens/${id}/revoke`).then(r => r.data),
};

export const catalogApi = {
  list: () => api.get<any[]>('/catalog').then(r => r.data),
};
