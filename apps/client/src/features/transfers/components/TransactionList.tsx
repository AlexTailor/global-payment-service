import type { Account } from '@/features/accounts';

import type { Transfer } from '../types';
import { TransactionRow } from './TransactionRow';

interface TransactionListProps {
  transfers: Transfer[];
  viewerAccountId: string;
  accounts: Account[];
}

export function TransactionList({
  transfers,
  viewerAccountId,
  accounts,
}: Readonly<TransactionListProps>) {
  return (
    <div className="flex flex-col gap-2">
      {transfers.map((transfer) => (
        <TransactionRow
          key={transfer.id}
          transfer={transfer}
          viewerAccountId={viewerAccountId}
          accounts={accounts}
        />
      ))}
    </div>
  );
}
