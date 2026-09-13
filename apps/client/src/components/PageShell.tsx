import { lazy, Suspense, useState } from 'react';
import { Plus, Wallet } from 'lucide-react';

import { AccountSwitcher, useAccountSwitcher } from '@/features/accounts';
import { TransactionList, TransactionTable, useTransfers } from '@/features/transfers';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Typography } from '@/components/ui/typography';

import { EmptyState } from './EmptyState';

const TransferModal = lazy(() => import('@/features/transfers/components/TransferModal'));

export function PageShell() {
  return (
    <AccountSwitcher.Provider>
      <PageShellContent />
    </AccountSwitcher.Provider>
  );
}

function PageShellContent() {
  const {
    state: { accounts, selectedId },
    actions: { openNewAccount },
  } = useAccountSwitcher();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const selectedAccount = accounts.find((account) => account.id === selectedId);
  const { data: transfers = [] } = useTransfers(selectedId);

  if (accounts.length === 0) {
    return (
      <div className="mx-auto flex min-h-screen max-w-260 flex-col px-4 py-4 md:px-10">
        <Typography variant="body" className="text-[15px] font-medium">
          Global Payment Service
        </Typography>
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Create one to hold a balance and start sending money. You can add more currencies later."
        >
          <Button size="lg" onClick={openNewAccount}>
            Create your first account
          </Button>
        </EmptyState>
      </div>
    );
  }

  if (!selectedAccount || !selectedId) return null;

  return (
    <div className="mx-auto flex min-h-screen max-w-260 flex-col px-4 pb-28 md:px-10 md:pb-10">
      <Modal.Root open={switcherOpen} onOpenChange={setSwitcherOpen}>
        <div className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
          <Typography variant="body" className="text-[15px] font-medium">
            Global Payment Service
          </Typography>
          <div className="flex items-center gap-3 md:order-2">
            <AccountSwitcher.Trigger />
            {isDesktop && (
              <Button onClick={() => setTransferOpen(true)}>
                <Plus data-icon="inline-start" className="size-4" aria-hidden />
                New transfer
              </Button>
            )}
          </div>
        </div>
        <AccountSwitcher.Panel />
      </Modal.Root>

      <div className="mt-5 mb-2.5 flex items-baseline justify-between">
        <Typography variant="eyebrow">Transactions</Typography>
        <Typography variant="caption">{transfers.length} · all statuses</Typography>
      </div>

      {transfers.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="Transfers to and from this account will show up here, including ones that fail."
        />
      ) : isDesktop ? (
        <TransactionTable transfers={transfers} viewerAccountId={selectedId} accounts={accounts} />
      ) : (
        <TransactionList transfers={transfers} viewerAccountId={selectedId} accounts={accounts} />
      )}

      {!isDesktop && (
        <div className="fixed inset-x-0 bottom-0 bg-linear-to-t from-bg from-55% to-transparent p-4 pt-8">
          <Button size="lg" className="w-full" onClick={() => setTransferOpen(true)}>
            New transfer
          </Button>
        </div>
      )}

      {transferOpen && (
        <Suspense fallback={null}>
          <TransferModal
            sourceAccount={selectedAccount}
            open={transferOpen}
            onOpenChange={setTransferOpen}
          />
        </Suspense>
      )}
    </div>
  );
}
