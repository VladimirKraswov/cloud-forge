export type JobStatus = "pending" | "running" | "finished" | "failed";

export interface Job {
  id: string;
  status: JobStatus;
  command: string;
}

export interface Token {
  token: string;
  job_id: string;
  used: number;
}

export interface ClaimResponse {
  job_id: string;
  command: string;
}

export interface LogEntry {
  job_id: string;
  message: string;
}