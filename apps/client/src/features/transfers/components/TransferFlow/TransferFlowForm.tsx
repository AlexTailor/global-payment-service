import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { useAccounts } from '@/features/accounts';
import { formatCurrency } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { AmountInputField, SelectField } from '@/components/form';
import { Typography } from '@/components/ui/typography';

import { useTransferFlow } from './TransferFlowContext';

const schema = z.object({
  toAccountId: z.string().min(1, 'Pick a destination account.'),
  amount: z
    .string()
    .min(1, 'Amount must be greater than 0.')
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) > 0, 'Amount must be greater than 0.'),
});

type FormValues = z.infer<typeof schema>;

export function TransferFlowForm() {
  const {
    state: { step, sourceAccount },
    actions: { submit },
  } = useTransferFlow();
  const { data: accounts = [] } = useAccounts();

  const {
    control,
    handleSubmit,
    formState: { isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { toAccountId: '', amount: '' },
  });

  const amount = useWatch({ control, name: 'amount' });

  if (step !== 'form') return null;

  const destinationOptions = accounts
    .filter((account) => account.id !== sourceAccount.id)
    .map((account) => ({ value: account.id, label: `${account.ownerName} · ${account.currency}` }));

  const onSubmit = handleSubmit((values) => submit(values));

  const numericAmount = Number(amount);
  const sendLabel =
    amount && !Number.isNaN(numericAmount) && numericAmount > 0
      ? `Send ${formatCurrency(numericAmount, sourceAccount.currency)}`
      : 'Send';

  return (
    <Modal.Content>
      <Modal.Header>
        <Modal.Title>New transfer</Modal.Title>
        <Modal.Description>
          From {sourceAccount.ownerName} · {sourceAccount.currency} ·{' '}
          {formatCurrency(sourceAccount.balance, sourceAccount.currency)}
        </Modal.Description>
      </Modal.Header>
      <form onSubmit={onSubmit}>
        <Modal.Body>
          <SelectField
            control={control}
            name="toAccountId"
            options={destinationOptions}
            placeholder="To account"
          />
          <div className="flex flex-col gap-1.5">
            <AmountInputField
              control={control}
              name="amount"
              currency={sourceAccount.currency}
              size="lg"
            />
            <Typography variant="caption">
              Currency is {sourceAccount.currency} — the source account's own. Fixed, not chosen.
            </Typography>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Modal.Close render={<Button type="button" variant="secondary" size="lg" />}>
            Cancel
          </Modal.Close>
          <Button type="submit" size="lg" disabled={!isValid}>
            {sendLabel}
          </Button>
        </Modal.Footer>
      </form>
    </Modal.Content>
  );
}
