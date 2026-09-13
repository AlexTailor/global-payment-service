import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

import { getTransfers } from '../api/transfers.api';

export function useTransfers(accountId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.transfers.list(accountId),
    queryFn: () => getTransfers(accountId),
    enabled: accountId !== undefined,
  });
}
