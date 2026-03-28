import axios from 'axios';
import { ApiClientError } from '@/api/client';

function extractMessage(data: unknown) {
  if (!data || typeof data !== 'object') return null;

  const payload = data as {
    error?: string;
    message?: string;
    errors?: string[];
  };

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return payload.errors.join('\n');
  }

  if (typeof payload.error === 'string') {
    return payload.error;
  }

  if (typeof payload.message === 'string') {
    return payload.message;
  }

  return null;
}

export function getApiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    const payload = error.payload as
      | { errors?: string[]; error?: string; message?: string }
      | undefined;

    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      return payload.errors.join('\n');
    }

    if (typeof payload?.error === 'string' && payload.error.trim().length > 0) {
      return payload.error;
    }

    if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
      return payload.message;
    }

    return error.message || 'Request failed';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}
