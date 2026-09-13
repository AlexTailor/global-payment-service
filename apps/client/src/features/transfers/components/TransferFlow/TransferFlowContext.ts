import { createContext, use } from 'react';

import type { Account } from '@/features/accounts';
import type { ApiError } from '@/types/api';

import type { Transfer } from '../../types';

export interface TransferFormValues {
  toAccountId: string;
  amount: string;
}

export interface TransferFlowState {
  step: 'form' | 'pending' | 'success' | 'failed';
  sourceAccount: Account;
  result?: Transfer;
  error?: ApiError;
}

export interface TransferFlowActions {
  submit: (values: TransferFormValues) => void;
  retry: () => void;
  editAmount: () => void;
  reset: () => void;
}

export interface TransferFlowMeta {
  idempotencyKey: string;
}

export interface TransferFlowContextValue {
  state: TransferFlowState;
  actions: TransferFlowActions;
  meta: TransferFlowMeta;
}

export const TransferFlowContext = createContext<TransferFlowContextValue | null>(null);

export function useTransferFlow(): TransferFlowContextValue {
  const context = use(TransferFlowContext);
  if (!context) {
    throw new Error('useTransferFlow must be used within TransferFlow.Provider');
  }
  return context;
}
