import type { Account } from '@/features/accounts';
import { formatCurrency } from '@/lib/currency';
import { Card } from '@/components/ui/card';
import { StatusIcon } from '@/components/ui/status-icon';
import { Typography } from '@/components/ui/typography';
import type { Currency } from '@/types/api';

import type { Transfer } from '../types';
import { StatusBadge } from './StatusBadge';

export interface TransactionRowData {
  direction: 'in' | 'out';
  counterpartyName: string;
  counterpartyCurrency: Currency;
  viewerCurrency: Currency;
  signedAmount: number;
  secondLine: string;
  reference: string;
}

function formatRelativeDateTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;

  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

// The backend has no dedicated reference field — the transfer's own id is the one
// unique-per-transfer string available, truncated to look like the mockup's example.
export function getTransactionReference(transferId: string): string {
  return `${transferId.slice(0, 8)}…${transferId.slice(-3)}`;
}

export function getTransactionRowData(
  transfer: Transfer,
  viewerAccountId: string,
  accounts: Account[],
): TransactionRowData {
  const direction = transfer.fromAccountId === viewerAccountId ? 'out' : 'in';
  const counterpartyId = direction === 'out' ? transfer.toAccountId : transfer.fromAccountId;
  const counterparty = accounts.find((account) => account.id === counterpartyId);
  const viewerCurrency = direction === 'out' ? transfer.sourceCurrency : transfer.targetCurrency;
  const convertedAmount = transfer.exchangeRate
    ? transfer.amount * transfer.exchangeRate
    : transfer.amount;
  const signedAmount = direction === 'out' ? -transfer.amount : convertedAmount;
  const reference = getTransactionReference(transfer.id);

  let secondLine: string;
  if (transfer.status === 'PROCESSING') {
    secondLine = transfer.sourceCurrency !== transfer.targetCurrency ? 'Resolving rate' : 'Moving funds';
  } else if (transfer.status === 'FAILED') {
    secondLine = 'Transfer failed';
  } else if (direction === 'in' && transfer.exchangeRate) {
    secondLine = `${formatCurrency(transfer.amount, transfer.sourceCurrency)} at ${transfer.exchangeRate.toFixed(4)}`;
  } else {
    secondLine = reference;
  }

  return {
    direction,
    counterpartyName: counterparty?.ownerName ?? 'Unknown',
    counterpartyCurrency: counterparty?.currency ?? viewerCurrency,
    viewerCurrency,
    signedAmount,
    secondLine,
    reference,
  };
}

interface TransactionRowProps {
  transfer: Transfer;
  viewerAccountId: string;
  accounts: Account[];
}

export function TransactionRow({ transfer, viewerAccountId, accounts }: TransactionRowProps) {
  const row = getTransactionRowData(transfer, viewerAccountId, accounts);

  return (
    <Card.Root className="flex-row items-center gap-3 px-3.5">
      <StatusIcon status={transfer.status} direction={row.direction} />
      <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
        <Typography variant="body" className="truncate">
          {row.counterpartyName} · {row.counterpartyCurrency}
        </Typography>
        <Typography variant="caption" className="truncate">
          {formatRelativeDateTime(transfer.createdAt)} · {row.secondLine}
        </Typography>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Typography variant="amount" className="text-sm">
          {row.signedAmount >= 0 ? '+' : ''}
          {formatCurrency(row.signedAmount, row.viewerCurrency)}
        </Typography>
        <StatusBadge status={transfer.status} />
      </div>
    </Card.Root>
  );
}
