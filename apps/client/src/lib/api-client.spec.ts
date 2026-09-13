import { AxiosError, AxiosHeaders } from 'axios';

import { apiClient, normalizeApiError } from './api-client';

describe('apiClient', () => {
  it('targets the API base URL with a /api prefix', () => {
    expect(apiClient.defaults.baseURL).toBe('http://localhost:8080/api');
  });
});

describe('normalizeApiError', () => {
  it('passes through a well-formed ApiError response body', () => {
    const error = new AxiosError('Request failed', '404', undefined, undefined, {
      status: 404,
      statusText: 'Not Found',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: { code: 404, message: 'Account not found', timestamp: '2026-01-01T00:00:00Z' },
    });

    expect(normalizeApiError(error)).toEqual({
      code: 404,
      message: 'Account not found',
      timestamp: '2026-01-01T00:00:00Z',
    });
  });

  it('falls back to status + axios message for a non-ApiError response body', () => {
    const error = new AxiosError('Request failed with status code 400', '400', undefined, undefined, {
      status: 400,
      statusText: 'Bad Request',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: { error: 'Bad Request', path: '/api/transfers' },
    });

    const result = normalizeApiError(error);
    expect(result.code).toBe(400);
    expect(result.message).toBe('Request failed with status code 400');
  });

  it('reports code 0 for a network error with no response at all', () => {
    const error = new AxiosError('Network Error');

    const result = normalizeApiError(error);
    expect(result.code).toBe(0);
    expect(result.message).toBe('Network Error');
  });

  it('reports code 0 for a thrown value that is not an AxiosError', () => {
    const result = normalizeApiError(new Error('boom'));
    expect(result.code).toBe(0);
    expect(result.message).toBe('boom');
  });
});
