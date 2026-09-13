import { apiClient } from '@/lib/api-client';

import type { CreateTransferRequest, Transfer } from '../types';

export const getTransfers = async (accountId?: string) =>
  (await apiClient.get<Transfer[]>('/transfers', { params: accountId ? { accountId } : undefined }))
    .data;

export const createTransfer = async (body: CreateTransferRequest, idempotencyKey: string) =>
  (
    await apiClient.post<Transfer>('/transfers', body, {
      headers: { 'X-Idempotency-Key': idempotencyKey },
    })
  ).data;
