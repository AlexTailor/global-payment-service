import {
  lazy,
  Suspense,
  startTransition,
  useState,
  type ReactNode,
} from 'react';

import { useTransfers } from '@/features/transfers';

import { useAccounts } from '../hooks/useAccounts';
import { useSelectedAccount } from '../hooks/useSelectedAccount';
import {
  AccountSwitcherContext,
  type AccountSwitcherContextValue,
} from './AccountSwitcherContext';
import { AccountSwitcherTrigger } from './AccountSwitcherTrigger';
import { AccountSwitcherPanel } from './AccountSwitcherPanel';

const NewAccountModal = lazy(() =>
  import('./NewAccountModal').then((mod) => ({ default: mod.NewAccountModal })),
);

interface AccountSwitcherProviderProps {
  readonly children: ReactNode;
}

function AccountSwitcherProvider({ children }: AccountSwitcherProviderProps) {
  const { data: accounts = [] } = useAccounts();
  const { selectedId, select: setSelectedId } = useSelectedAccount(accounts);
  const { isFetching: isSwitching } = useTransfers(selectedId);
  const [newAccountOpen, setNewAccountOpen] = useState(false);

  const select = (id: string) => {
    startTransition(() => setSelectedId(id));
  };

  const value: AccountSwitcherContextValue = {
    state: { accounts, selectedId, isSwitching },
    actions: {
      select,
      openNewAccount: () => setNewAccountOpen(true),
    },
  };

  return (
    <AccountSwitcherContext value={value}>
      {children}
      {newAccountOpen && (
        <Suspense fallback={null}>
          <NewAccountModal
            open={newAccountOpen}
            onOpenChange={setNewAccountOpen}
            onCreated={(accountId) => {
              select(accountId);
              setNewAccountOpen(false);
            }}
          />
        </Suspense>
      )}
    </AccountSwitcherContext>
  );
}

export const AccountSwitcher = {
  Provider: AccountSwitcherProvider,
  Trigger: AccountSwitcherTrigger,
  Panel: AccountSwitcherPanel,
};
