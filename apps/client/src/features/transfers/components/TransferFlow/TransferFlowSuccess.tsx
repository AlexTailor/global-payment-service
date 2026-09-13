import { Check } from 'lucide-react';

import { useAccounts } from '@/features/accounts';
import { formatCurrency } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Typography } from '@/components/ui/typography';

import { getTransactionReference } from '../TransactionRow';
import { useTransferFlow } from './TransferFlowContext';

export function TransferFlowSuccess() {
  const {
    state: { step, sourceAccount, result },
    actions: { reset },
  } = useTransferFlow();
  const { data: accounts = [] } = useAccounts();

  if (step !== 'success' || !result) return null;

  const destination = accounts.find((account) => account.id === result.toAccountId);
  const currentSourceAccount = accounts.find((account) => account.id === sourceAccount.id);
  const crossCurrency = result.sourceCurrency !== result.targetCurrency;
  const creditedAmount = result.exchangeRate ? result.amount * result.exchangeRate : result.amount;

  return (
    <Modal.Content>
      <Modal.Header className="items-center text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-accent">
          <Check className="size-5 text-accent" aria-hidden />
        </div>
        <Modal.Title>Sikeres utalás</Modal.Title>
        <Typography variant="caption">
          {formatCurrency(result.amount, result.sourceCurrency)} elküldve{' '}
          {destination?.ownerName ?? 'a célszámla'} részére
        </Typography>
      </Modal.Header>
      <Modal.Body>
        <div className="flex flex-col divide-y divide-divider rounded-lg border border-divider">
          {crossCurrency && (
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <Typography variant="caption">Jóváírva</Typography>
              <Typography variant="amount">
                {formatCurrency(creditedAmount, result.targetCurrency)}
              </Typography>
            </div>
          )}
          {crossCurrency && result.exchangeRate && (
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <Typography variant="caption">Árfolyam</Typography>
              <Typography variant="amount">{result.exchangeRate.toFixed(4)}</Typography>
            </div>
          )}
          {currentSourceAccount && (
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <Typography variant="caption">Új egyenleg</Typography>
              <Typography variant="amount">
                {formatCurrency(currentSourceAccount.balance, currentSourceAccount.currency)}
              </Typography>
            </div>
          )}
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <Typography variant="caption">Azonosító</Typography>
            <Typography variant="mono">{getTransactionReference(result.id)}</Typography>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" size="lg" onClick={reset}>
          Új utalás küldése
        </Button>
        <Modal.Close render={<Button size="lg" onClick={reset} />}>Kész</Modal.Close>
      </Modal.Footer>
    </Modal.Content>
  );
}
