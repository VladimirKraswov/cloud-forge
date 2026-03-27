export type ExecutionLanguage = 'python' | 'javascript';
export type RunStatus = 'created' | 'running' | 'finished' | 'failed' | 'cancelled' | 'lost';
export type WorkerStatus = 'online' | 'busy' | 'offline';
export type LogLevel = 'info' | 'warn' | 'error';
export type SupportLevel = 'supported' | 'future';
export type ContainerPresetCategory = 'bootstrap' | 'runtime' | 'model' | 'service';

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

export interface JobPayload {
  title: string;
  description?: string | null;
  owner_id?: string | null;
  containers: Container[];
  environments: Record<string, string>;
  attached_files: AttachedFile[];
  execution_code: string;
  execution_language: ExecutionLanguage;
  entrypoint?: string | null;
}

export interface Job extends JobPayload {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface JobListItem extends Job {
  latest_run_status?: RunStatus | null;
  latest_run_at?: string | null;
  runs_count?: number;
  active_runs_count?: number;
}

export interface WorkspaceLayout {
  root: string;
  code_dir: string;
  input_dir: string;
  output_dir: string;
  artifacts_dir: string;
  tmp_dir: string;
}

export interface RunConfigSnapshot {
  job_id: string;
  containers: Container[];
  environments: Record<string, string>;
  attached_files: AttachedFile[];
  execution_code: string;
  execution_language: ExecutionLanguage;
  entrypoint?: string | null;
  workspace: WorkspaceLayout;
}

export interface LogEntry {
  id?: number;
  run_id: string;
  level: LogLevel;
  message: string;
  timestamp?: string;
}

export interface RunArtifact {
  id: string;
  run_id: string;
  filename: string;
  relative_path: string;
  size_bytes: number;
  storage_key: string;
  mime_type: string;
  created_at: string;
  download_path?: string;
}

export interface Run {
  id: string;
  job_id: string;
  share_token_id: string;
  worker_id?: string | null;
  worker_name?: string | null;
  status: RunStatus;
  result?: string | null;
  metrics?: unknown;
  config_snapshot: RunConfigSnapshot;
  started_at?: string | null;
  finished_at?: string | null;
  last_heartbeat_at?: string | null;
  cancel_requested_at?: string | null;
  cancel_reason?: string | null;
  created_at: string;
  updated_at: string;
  logs?: LogEntry[];
  artifacts?: RunArtifact[];
  job_title?: string;
}

export interface ShareToken {
  id: string;
  job_id: string;
  token: string;
  expires_at?: string | null;
  max_claims?: number | null;
  claim_count: number;
  remaining_claims?: number | null;
  revoked: boolean;
  last_claimed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShareTokenDetails extends ShareToken {
  base_url?: string;
  claim_url?: string;
  share_url?: string;
  docker_command?: string;
  worker_command?: string;
}

export interface Worker {
  id: string;
  name: string;
  host?: string | null;
  status: WorkerStatus;
  current_run_id?: string | null;
  capabilities?: Record<string, unknown> | null;
  last_seen_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardSummary {
  jobs_total: number;
  runs_total: number;
  runs_by_status: Partial<Record<RunStatus, number>>;
  workers_online: number;
  workers_total: number;
}

export interface RecentEvent {
  id?: string;
  type?: string;
  status?: RunStatus;
  message: string;
  details?: string;
  created_at: string;
}

export interface JobDraftTemplate extends JobPayload {}

export interface JobTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  draft: JobDraftTemplate;
  support_level: SupportLevel;
}

export interface ContainerPreset {
  id: string;
  name: string;
  category: ContainerPresetCategory;
  description: string;
  recommended_for: string[];
  container: Container;
  support_level: SupportLevel;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

export interface JobsListResponse {
  jobs: JobListItem[];
  total: number;
}