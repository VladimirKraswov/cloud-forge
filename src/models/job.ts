export type ExecutionLanguage = 'python' | 'javascript';

export type RunStatus =
  | 'created'
  | 'running'
  | 'finished'
  | 'failed'
  | 'cancelled'
  | 'lost';

export type LogLevel = 'info' | 'warn' | 'error';

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

export interface WorkspaceLayout {
  root: string;
  code_dir: string;
  input_dir: string;
  output_dir: string;
  artifacts_dir: string;
  tmp_dir: string;
}

export interface Job {
  id: string;
  title: string;
  description?: string | null;
  owner_id?: string | null;
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

export interface Run {
  id: string;
  job_id: string;
  share_token_id: string;
  status: RunStatus;
  worker_name?: string | null;
  result?: string | null;
  metrics?: unknown;
  config_snapshot: RunConfigSnapshot;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShareToken {
  id: string;
  job_id: string;
  token: string;
  expires_at?: string | null;
  max_claims?: number | null;
  claim_count: number;
  revoked: boolean;
  last_claimed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LogEntry {
  id?: number;
  run_id: string;
  level: LogLevel;
  message: string;
  timestamp?: string;
}