import { createContext, use } from 'react';

import type { Account } from '../types';

export interface AccountSwitcherState {
  accounts: Account[];
  selectedId: string | undefined;
  isSwitching: boolean;
}

export interface AccountSwitcherActions {
  select: (id: string) => void;
  openNewAccount: () => void;
}

export interface AccountSwitcherContextValue {
  state: AccountSwitcherState;
  actions: AccountSwitcherActions;
}

export const AccountSwitcherContext = createContext<AccountSwitcherContextValue | null>(null);

export function useAccountSwitcher(): AccountSwitcherContextValue {
  const context = use(AccountSwitcherContext);
  if (!context) {
    throw new Error('useAccountSwitcher must be used within AccountSwitcher.Provider');
  }
  return context;
}
