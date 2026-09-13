import axios, { isAxiosError } from 'axios';

import type { ApiError } from '@/types/api';

export const apiClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function normalizeApiError(error: unknown): ApiError {
  if (isAxiosError<ApiError>(error) && error.response) {
    const body = error.response.data;
    if (typeof body?.code === 'number' && typeof body?.message === 'string') {
      return body;
    }
    return {
      code: error.response.status,
      message: error.message,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    code: 0,
    message: error instanceof Error ? error.message : 'Network error',
    timestamp: new Date().toISOString(),
  };
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(normalizeApiError(error)),
);
