export type ExecutionLanguage = 'python' | 'javascript';
export type RunStatus = 'created' | 'running' | 'finished' | 'failed' | 'cancelled' | 'lost';
export type WorkerStatus = 'online' | 'busy' | 'offline';
export type LogLevel = 'info' | 'warn' | 'error';
export type SupportLevel = 'supported' | 'future';
export type ContainerPresetCategory = 'bootstrap' | 'runtime' | 'model' | 'service';

export interface RuntimeResources {
  gpus?: string;
  shm_size?: string;
  cpu_limit?: number;
  memory_limit?: string;
}

export interface Container {
  name: string;
  image: string;
  is_parent?: boolean;
  resources?: RuntimeResources;
  env?: Record<string, string>;
}

export interface AttachedFile {
  id: string;
  filename: string;
  size_bytes: number;
  storage_key: string;
  mime_type: string;
}

export interface BootstrapEnvironmentSpec {
  name: string;
  python_binary?: string | null;
  requirements_text: string;
}

export interface BootstrapImage {
  id: string;
  name: string;
  base_image: string;
  tag: string;
  full_image_name: string;
  dockerfile_text: string;
  environments: BootstrapEnvironmentSpec[];
  execution_language?: ExecutionLanguage;
  runtime_resources?: RuntimeResources | null;
  sdk_version?: string | null;
  status: 'draft' | 'building' | 'pushing' | 'completed' | 'failed' | 'cancelled';
  error?: string | null;
  build_started_at?: string | null;
  build_finished_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BootstrapImageLogEntry {
  id: number;
  image_id: string;
  level: LogLevel;
  message: string;
  created_at: string;
}

export interface BootstrapBuildProgress {
  status: 'building' | 'pushing' | 'completed' | 'failed' | 'cancelled';
  logs: string[];
}

export interface JobPayload {
  title: string;
  description?: string | null;
  owner_id?: string | null;
  bootstrap_image_id: string;
  execution_language?: ExecutionLanguage;
  environment_variables: Record<string, string>;
  resources?: RuntimeResources | null;
  entrypoint: string;
  entrypoint_args: string[];
  working_dir?: string | null;
}

export interface Job extends JobPayload {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface JobListItem extends Job {
  bootstrap_image_name?: string | null;
  bootstrap_full_image_name?: string | null;
  latest_run_status?: RunStatus | null;
  latest_run_at?: string | null;
  runs_count: number;
  active_runs_count: number;
}

export interface JobFile {
  id: string;
  job_id: string;
  relative_path: string;
  filename: string;
  source_type: 'upload' | 'inline' | 'directory';
  storage_key?: string | null;
  inline_content?: string | null;
  mime_type: string;
  size_bytes: number;
  is_executable: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobFileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  file?: JobFile;
  children: JobFileTreeNode[];
}

export interface JobDetailsResponse {
  job: Job;
  bootstrap_image?: BootstrapImage | null;
  files: JobFile[];
  share_tokens: ShareToken[];
  stats: {
    total_runs: number;
    active_runs: number;
  };
}

export interface WorkspaceLayout {
  root: string;
  artifacts_dir: string;
  tmp_dir: string;
}

export interface RunManifestFile {
  relative_path: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
  is_executable: boolean;
  source_type: 'upload' | 'inline';
  download_url: string;
}

export interface RunManifest {
  run_id: string;
  job_id: string;
  bootstrap_image: {
    id: string;
    full_image_name: string;
    name: string;
  };
  workspace: WorkspaceLayout;
  environment_variables: Record<string, string>;
  entrypoint: string;
  entrypoint_args: string[];
  working_dir: string;
  files: RunManifestFile[];
  control: {
    start_url: string;
    heartbeat_url: string;
    logs_url: string;
    progress_url: string;
    finish_url: string;
    cancel_url: string;
  };
  artifacts: {
    upload_url: string;
  };
}

export interface LogEntry {
  id?: number;
  run_id: string;
  level: LogLevel;
  message: string;
  timestamp?: string;
}

export interface RunEvent {
  id: string;
  run_id: string;
  type: 'status' | 'progress' | 'metric' | 'log';
  stage?: string | null;
  progress?: number | null;
  message?: string | null;
  level?: LogLevel | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
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
  content_path?: string;
}

export interface Run {
  id: string;
  job_id: string;
  share_token_id: string;
  bootstrap_image_id: string;
  worker_id?: string | null;
  worker_name?: string | null;
  status: RunStatus;
  stage?: string | null;
  progress?: number | null;
  status_message?: string | null;
  result?: string | null;
  metrics?: unknown;
  run_manifest: RunManifest;
  started_at?: string | null;
  finished_at?: string | null;
  last_heartbeat_at?: string | null;
  cancel_requested_at?: string | null;
  cancel_reason?: string | null;
  created_at: string;
  updated_at: string;
  logs?: LogEntry[];
  events?: RunEvent[];
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
  docker_image?: string;
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

export interface JobDraftTemplate {
  title: string;
  description: string;
  containers: Container[];
  environments: Record<string, string>;
  attached_files: AttachedFile[];
  execution_code: string;
  execution_language: ExecutionLanguage;
  entrypoint?: string | null;
}

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
  items: JobListItem[];
  total: number;
}

export interface RunsListResponse {
  items: Run[];
  total: number;
}