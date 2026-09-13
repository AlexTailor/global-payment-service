import type { Account } from '@/features/accounts';
import { formatCurrency } from '@/lib/currency';
import { Typography } from '@/components/ui/typography';

import type { Transfer } from '../types';
import { getTransactionRowData } from './TransactionRow';
import { StatusBadge } from './StatusBadge';

interface TransactionTableProps {
  transfers: Transfer[];
  viewerAccountId: string;
  accounts: Account[];
}

export function TransactionTable({
  transfers,
  viewerAccountId,
  accounts,
}: Readonly<TransactionTableProps>) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr>
          <th className="pb-2 text-left">
            <Typography variant="eyebrow" className="opacity-60">
              Date
            </Typography>
          </th>
          <th className="pb-2 text-left">
            <Typography variant="eyebrow" className="opacity-60">
              Counterparty
            </Typography>
          </th>
          <th className="pb-2 text-left">
            <Typography variant="eyebrow" className="opacity-60">
              Reference
            </Typography>
          </th>
          <th className="pb-2 text-right">
            <Typography variant="eyebrow" className="opacity-60">
              Amount
            </Typography>
          </th>
          <th className="pb-2 text-right">
            <Typography variant="eyebrow" className="opacity-60">
              Rate
            </Typography>
          </th>
          <th className="pb-2 text-right">
            <Typography variant="eyebrow" className="opacity-60">
              Status
            </Typography>
          </th>
        </tr>
      </thead>
      <tbody>
        {transfers.map((transfer) => {
          const row = getTransactionRowData(transfer, viewerAccountId, accounts);
          return (
            <tr
              key={transfer.id}
              className="border-b border-divider hover:bg-[color-mix(in_srgb,var(--color-neutral-500)_4%,transparent)]"
            >
              <td className="py-2.5">
                <Typography className="text-neutral-400">
                  {new Date(transfer.createdAt).toLocaleDateString()}
                </Typography>
              </td>
              <td className="py-2.5">
                <Typography>
                  {row.counterpartyName} · {row.counterpartyCurrency}
                </Typography>
              </td>
              <td className="py-2.5">
                <Typography variant="mono">{row.reference}</Typography>
              </td>
              <td className="py-2.5 text-right">
                <Typography variant="amount">
                  {row.signedAmount >= 0 ? '+' : ''}
                  {formatCurrency(row.signedAmount, row.viewerCurrency)}
                </Typography>
              </td>
              <td className="py-2.5 text-right">
                <Typography variant="amount" className="text-neutral-500">
                  {transfer.exchangeRate ? transfer.exchangeRate.toFixed(4) : '—'}
                </Typography>
              </td>
              <td className="py-2.5 text-right">
                <div className="flex justify-end">
                  <StatusBadge status={transfer.status} />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
