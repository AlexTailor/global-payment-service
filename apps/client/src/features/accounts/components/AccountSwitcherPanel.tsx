import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

import { useAccountSwitcher } from './AccountSwitcherContext';
import { AccountSwitcherRow } from './AccountSwitcherRow';

export function AccountSwitcherPanel() {
  const {
    state: { accounts, selectedId, isSwitching },
    actions: { select, openNewAccount },
  } = useAccountSwitcher();

  const currencyCount = new Set(accounts.map((account) => account.currency)).size;

  return (
    <Modal.Content>
      <Modal.Header className="flex-row items-center justify-between">
        <Modal.Title>Accounts</Modal.Title>
        <span className="text-[11px] text-neutral-500">
          {accounts.length} account{accounts.length === 1 ? '' : 's'} · {currencyCount} currenc
          {currencyCount === 1 ? 'y' : 'ies'}
        </span>
      </Modal.Header>
      <Modal.Body>
        <div className="flex flex-col gap-2">
          {accounts.map((account) => (
            <AccountSwitcherRow
              key={account.id}
              account={account}
              selected={account.id === selectedId}
              switching={isSwitching}
              onSelect={select}
            />
          ))}
        </div>
        <Button variant="ghost" size="sm" className="justify-start" onClick={openNewAccount}>
          <Plus data-icon="inline-start" className="size-4" aria-hidden />
          New account
        </Button>
      </Modal.Body>
    </Modal.Content>
  );
}
