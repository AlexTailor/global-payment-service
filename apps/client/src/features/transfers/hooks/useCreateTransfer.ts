import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

import { createTransfer } from '../api/transfers.api';
import type { CreateTransferRequest } from '../types';

interface CreateTransferVariables {
  body: CreateTransferRequest;
  idempotencyKey: string;
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ body, idempotencyKey }: CreateTransferVariables) =>
      createTransfer(body, idempotencyKey),
    onSuccess: () => {
      // The source account's balance just changed, so the switcher's cached balance
      // would otherwise go stale until an unrelated refetch happened to occur.
      queryClient.invalidateQueries({ queryKey: queryKeys.transfers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all });
    },
  });
}
