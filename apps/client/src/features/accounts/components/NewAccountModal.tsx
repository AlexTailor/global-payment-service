import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { AmountInputField, InputField, SegmentedControlField } from '@/components/form';

import { useCreateAccount } from '../hooks/useCreateAccount';

const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
  { value: 'HUF', label: 'HUF' },
];

const schema = z.object({
  ownerName: z.string().trim().min(1, 'Owner name is required.'),
  currency: z.enum(['EUR', 'USD', 'HUF']),
  initialBalance: z
    .string()
    .min(1, 'Amount is required.')
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) >= 0, 'Must be zero or more.'),
});

type FormValues = z.infer<typeof schema>;

interface NewAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (accountId: string) => void;
}

export function NewAccountModal({ open, onOpenChange, onCreated }: NewAccountModalProps) {
  const createAccount = useCreateAccount();
  const {
    control,
    handleSubmit,
    reset,
    formState: { isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
    defaultValues: { ownerName: '', currency: 'EUR', initialBalance: '0' },
  });

  const currency = useWatch({ control, name: 'currency' });

  const onSubmit = handleSubmit((values) => {
    createAccount.mutate(
      {
        ownerName: values.ownerName,
        currency: values.currency,
        initialBalance: Number(values.initialBalance),
      },
      {
        onSuccess: (account) => {
          reset();
          onCreated(account.id);
        },
      },
    );
  });

  return (
    <Modal.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>New account</Modal.Title>
        </Modal.Header>
        <form onSubmit={onSubmit}>
          <Modal.Body>
            <InputField control={control} name="ownerName" placeholder="Owner name" />
            <SegmentedControlField control={control} name="currency" options={CURRENCY_OPTIONS} />
            <AmountInputField
              control={control}
              name="initialBalance"
              currency={currency}
              hint="Zero or more."
            />
          </Modal.Body>
          <Modal.Footer>
            <Modal.Close render={<Button type="button" variant="secondary" size="lg" />}>
              Cancel
            </Modal.Close>
            <Button
              type="submit"
              size="lg"
              disabled={!isValid || createAccount.isPending}
              loading={createAccount.isPending}
            >
              Create account
            </Button>
          </Modal.Footer>
        </form>
      </Modal.Content>
    </Modal.Root>
  );
}
