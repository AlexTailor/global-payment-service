import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Typography } from '@/components/ui/typography';

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
        <Modal.Title>Számlák</Modal.Title>
        <Typography variant="caption">
          {/* Hungarian nouns don't inflect for plural after a numeral, unlike English. */}
          {accounts.length} számla · {currencyCount} devizanem
        </Typography>
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
          Új számla
        </Button>
      </Modal.Body>
    </Modal.Content>
  );
}
