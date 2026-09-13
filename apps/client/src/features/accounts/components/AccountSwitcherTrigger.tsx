import { ChevronDown } from 'lucide-react';

import { formatCurrency } from '@/lib/currency';
import { Modal } from '@/components/ui/modal';
import { Typography } from '@/components/ui/typography';

import { useAccountSwitcher } from './AccountSwitcherContext';

export function AccountSwitcherTrigger() {
  const {
    state: { accounts, selectedId },
  } = useAccountSwitcher();
  const selectedAccount = accounts.find((account) => account.id === selectedId);

  if (!selectedAccount) return null;

  return (
    <Modal.Trigger
      render={
        <button
          type="button"
          className="flex min-h-16 w-full items-center justify-between rounded-lg border border-divider bg-surface px-3.5 py-3 text-left md:min-h-11 md:w-auto md:gap-3 md:px-3 md:py-2"
        />
      }
    >
      <span className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2">
        <Typography variant="label">
          {selectedAccount.ownerName} · {selectedAccount.currency}
        </Typography>
        <Typography variant="amount" className="text-[26px] font-medium md:text-sm">
          {formatCurrency(selectedAccount.balance, selectedAccount.currency)}
        </Typography>
      </span>
      <ChevronDown className="size-4 shrink-0 text-accent" aria-hidden />
    </Modal.Trigger>
  );
}
