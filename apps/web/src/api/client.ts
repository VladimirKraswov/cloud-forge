import axios, { AxiosError } from 'axios';

interface ErrorPayload {
  error?: string;
  message?: string;
  errors?: string[];
  warnings?: string[];
}

export class ApiClientError extends Error {
  status?: number;
  payload?: ErrorPayload | unknown;

  constructor(message: string, status?: number, payload?: ErrorPayload | unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.payload = payload;
  }
}

export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3000';

export const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ErrorPayload>) => {
    const payload = error.response?.data;
    const message =
      (Array.isArray(payload?.errors) && payload.errors.length
        ? payload.errors.join('\n')
        : undefined) ||
      payload?.error ||
      payload?.message ||
      error.message ||
      'Request failed';

    return Promise.reject(new ApiClientError(message, error.response?.status, payload));
  },
);

export function unwrap<T>(promise: Promise<{ data: T }>): Promise<T> {
  return promise.then((response) => response.data);
}

export function buildArtifactDownloadUrl(storageKey: string) {
  return `${apiBaseUrl}/artifacts/download?key=${encodeURIComponent(storageKey)}`;
}

export function buildArtifactContentUrl(storageKey: string) {
  return `${apiBaseUrl}/artifacts/content?key=${encodeURIComponent(storageKey)}`;
}

export function buildJobFileContentUrl(jobId: string, relativePath: string) {
  return (
    `${apiBaseUrl}/jobs/${jobId}/files/content?relativePath=` +
    encodeURIComponent(relativePath)
  );
}

export function buildRunWebSocketUrl(runId: string) {
  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/ws/runs/${runId}`;
  return url.toString();
}
