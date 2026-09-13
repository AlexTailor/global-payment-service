import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';
import type { ApiError } from '@/types/api';

import { createTransfer } from '../api/transfers.api';
import type { CreateTransferRequest, Transfer } from '../types';

interface CreateTransferVariables {
  body: CreateTransferRequest;
  idempotencyKey: string;
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();

  return useMutation<Transfer, ApiError, CreateTransferVariables>({
    mutationFn: ({ body, idempotencyKey }) =>
      createTransfer(body, idempotencyKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transfers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
    },
  });
}
