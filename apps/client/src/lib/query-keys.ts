export const queryKeys = {
  accounts: {
    all: ['accounts'] as const,
  },
  transfers: {
    all: ['transfers'] as const,
    list: (accountId: string | undefined) => [...queryKeys.transfers.all, accountId] as const,
  },
};
