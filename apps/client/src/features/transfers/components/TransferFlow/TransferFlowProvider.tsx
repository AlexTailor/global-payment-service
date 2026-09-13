import { useState, type ReactNode } from 'react';

import type { Account } from '@/features/accounts';
import type { ApiError } from '@/types/api';

import { useCreateTransfer } from '../../hooks/useCreateTransfer';
import type { Transfer } from '../../types';
import {
  TransferFlowContext,
  type TransferFlowContextValue,
  type TransferFlowState,
  type TransferFormValues,
} from './TransferFlowContext';

interface TransferFlowProviderProps {
  sourceAccount: Account;
  children: ReactNode;
}

export function TransferFlowProvider({
  sourceAccount,
  children,
}: TransferFlowProviderProps) {
  const [step, setStep] = useState<TransferFlowState['step']>('form');
  const [result, setResult] = useState<Transfer>();
  const [error, setError] = useState<ApiError>();
  const [lastValues, setLastValues] = useState<TransferFormValues | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  const createTransfer = useCreateTransfer();

  function attempt(values: TransferFormValues, key: string) {
    setStep('pending');
    createTransfer.mutate(
      {
        body: {
          fromAccountId: sourceAccount.id,
          toAccountId: values.toAccountId,
          amount: Number(values.amount),
          currency: sourceAccount.currency,
        },
        idempotencyKey: key,
      },
      {
        onSuccess: (transfer) => {
          setResult(transfer);
          setStep('success');
        },
        onError: (apiError) => {
          setError(apiError);
          setStep('failed');
        },
      },
    );
  }

  function submit(values: TransferFormValues) {
    setLastValues(values);
    attempt(values, idempotencyKey);
  }

  function retry() {
    if (lastValues) attempt(lastValues, idempotencyKey);
  }

  function editAmount() {
    setIdempotencyKey(crypto.randomUUID());
    setStep('form');
  }

  function reset() {
    setIdempotencyKey(crypto.randomUUID());
    setStep('form');
    setResult(undefined);
    setError(undefined);
    setLastValues(null);
  }

  const value: TransferFlowContextValue = {
    state: { step, sourceAccount, result, error },
    actions: { submit, retry, editAmount, reset },
    meta: { idempotencyKey },
  };

  return <TransferFlowContext value={value}>{children}</TransferFlowContext>;
}
