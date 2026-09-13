import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency';
import { Skeleton } from '@/components/ui/skeleton';
import { Typography } from '@/components/ui/typography';

import type { Account } from '../types';

interface AccountSwitcherRowProps {
  account: Account;
  selected: boolean;
  switching: boolean;
  onSelect: (id: string) => void;
}

export function AccountSwitcherRow({ account, selected, switching, onSelect }: AccountSwitcherRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(account.id)}
      className={cn(
        'flex h-16 w-full items-center justify-between rounded-lg border px-3.5 text-left transition-colors md:h-11 md:px-2.5',
        selected
          ? 'border-accent bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]'
          : 'border-divider hover:bg-[color-mix(in_srgb,var(--color-neutral-500)_7%,transparent)]',
      )}
    >
      <span className="flex flex-col gap-0.5">
        <Typography variant="body">{account.ownerName}</Typography>
        <Typography variant="label">{account.currency}</Typography>
      </span>
      {switching && selected ? (
        <Skeleton width={56} height={12} />
      ) : (
        <span className="flex items-center gap-2">
          <Typography variant="amount" className="text-[17px] font-medium md:text-[15px]">
            {formatCurrency(account.balance, account.currency)}
          </Typography>
          {selected && <Check className="size-4 text-accent" aria-hidden />}
        </span>
      )}
    </button>
  );
}
