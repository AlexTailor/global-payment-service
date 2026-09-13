import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

import { getAccounts } from '../api/accounts.api';

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts.all,
    queryFn: getAccounts,
  });
}
