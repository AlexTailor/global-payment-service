import { apiClient } from '@/lib/api-client';

import type { Account, CreateAccountRequest } from '../types';

export const getAccounts = async () =>
  (await apiClient.get<Account[]>('/accounts')).data;

export const createAccount = async (body: CreateAccountRequest) =>
  (await apiClient.post<Account>('/accounts', body)).data;
