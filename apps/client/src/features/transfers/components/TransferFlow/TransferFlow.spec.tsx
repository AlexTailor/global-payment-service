import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Modal } from '@/components/ui/modal';
import type { Account } from '@/features/accounts';

import * as transfersApi from '../../api/transfers.api';
import { TransferFlow } from './TransferFlow';

jest.mock('../../api/transfers.api');
jest.mock('@/features/accounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'source', ownerName: 'Me', currency: 'EUR', balance: 500 },
      { id: 'dest', ownerName: 'Alan Turing', currency: 'EUR', balance: 200 },
    ],
  }),
}));

// Base UI's Select popup hangs in jsdom (an upstream floating-ui/jsdom incompatibility,
// unrelated to this codebase — confirmed by reproducing it with the raw @base-ui/react/select
// primitives directly, no wrapper involved). Stubbed with a plain native <select> so the
// actual state-machine logic below (the point of this test) can still be exercised for real.
jest.mock('@/components/form', () => {
  const actual = jest.requireActual('@/components/form');
  const { Controller } = jest.requireActual('react-hook-form');
  return {
    ...actual,
    SelectField: ({ control, name, options }: any) => (
      <Controller
        control={control}
        name={name}
        render={({ field }: any) => (
          <select
            aria-label={name}
            value={field.value}
            onChange={(event) => field.onChange(event.target.value)}
            onBlur={field.onBlur}
          >
            <option value="" />
            {options.map((option: { value: string; label: string }) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      />
    ),
  };
});

const sourceAccount: Account = { id: 'source', ownerName: 'Me', currency: 'EUR', balance: 500 };

function renderFlow() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <TransferFlow.Provider sourceAccount={sourceAccount}>
        <Modal.Root defaultOpen>
          <TransferFlow.Form />
          <TransferFlow.Pending />
          <TransferFlow.Success />
          <TransferFlow.Failed />
        </Modal.Root>
      </TransferFlow.Provider>
    </QueryClientProvider>,
  );
}

async function chooseDestination(value: string) {
  fireEvent.change(screen.getByLabelText('toAccountId'), { target: { value } });
  fireEvent.blur(screen.getByLabelText('toAccountId'));
}

async function fillAmount(amount: string) {
  const amountInput = screen.getByPlaceholderText('0');
  fireEvent.change(amountInput, { target: { value: amount } });
  fireEvent.blur(amountInput);
  await waitFor(() => expect(screen.queryByText('Amount must be greater than 0.')).toBeNull());
}

async function submit() {
  const submitButton = await waitFor(() => {
    const button = screen.getByRole('button', { name: /^Send/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    return button;
  });
  fireEvent.click(submitButton);
}

describe('TransferFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the source account context and excludes it from the destination options', () => {
    renderFlow();

    expect(screen.getByText(/From Me · EUR/)).toBeTruthy();
    const select = screen.getByLabelText('toAccountId') as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((option) => option.textContent);
    expect(optionLabels).toContain('Alan Turing · EUR');
    expect(optionLabels).not.toContain('Me · EUR');
  });

  it('submits and shows the success screen with the transfer details', async () => {
    jest.mocked(transfersApi.createTransfer).mockResolvedValue({
      id: '8f2a19b4-c0de-4dad-b00b-1234567890c41',
      fromAccountId: 'source',
      toAccountId: 'dest',
      amount: 50,
      sourceCurrency: 'EUR',
      targetCurrency: 'EUR',
      exchangeRate: null,
      status: 'COMPLETED',
      createdAt: '2026-01-01T00:00:00Z',
    });

    renderFlow();
    await chooseDestination('dest');
    await fillAmount('50');
    await submit();

    expect(await screen.findByText('Transfer completed')).toBeTruthy();
    expect(screen.getByText(/€50.00 sent to Alan Turing/)).toBeTruthy();
  });

  it('shows the 409 failure screen and retries with the same idempotency key', async () => {
    jest.mocked(transfersApi.createTransfer).mockRejectedValue({
      code: 409,
      message: 'Account source has insufficient balance for this transfer',
      timestamp: 'x',
    });

    renderFlow();
    await chooseDestination('dest');
    await fillAmount('50');
    await submit();

    expect(await screen.findByText('Transfer failed')).toBeTruthy();
    expect(
      screen.getByText('Account source has insufficient balance for this transfer'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(transfersApi.createTransfer).toHaveBeenCalledTimes(2));
    const [, firstKey] = jest.mocked(transfersApi.createTransfer).mock.calls[0];
    const [, secondKey] = jest.mocked(transfersApi.createTransfer).mock.calls[1];
    expect(secondKey).toBe(firstKey);
  });

  it('mints a new idempotency key when editing the amount after a failure', async () => {
    jest
      .mocked(transfersApi.createTransfer)
      .mockRejectedValue({ code: 409, message: 'Insufficient balance', timestamp: 'x' });

    renderFlow();
    await chooseDestination('dest');
    await fillAmount('50');
    await submit();
    expect(await screen.findByText('Transfer failed')).toBeTruthy();
    const [, firstKey] = jest.mocked(transfersApi.createTransfer).mock.calls[0];

    fireEvent.click(screen.getByRole('button', { name: 'Edit amount' }));
    expect(await screen.findByLabelText('toAccountId')).toBeTruthy();

    jest.mocked(transfersApi.createTransfer).mockResolvedValue({
      id: 'id-2',
      fromAccountId: 'source',
      toAccountId: 'dest',
      amount: 50,
      sourceCurrency: 'EUR',
      targetCurrency: 'EUR',
      exchangeRate: null,
      status: 'COMPLETED',
      createdAt: '2026-01-01T00:00:00Z',
    });
    await fillAmount('50');
    await submit();

    await waitFor(() => expect(transfersApi.createTransfer).toHaveBeenCalledTimes(2));
    const [, secondKey] = jest.mocked(transfersApi.createTransfer).mock.calls[1];
    expect(secondKey).not.toBe(firstKey);
  });

  it('shows the 503 failure screen with FX-unavailable copy', async () => {
    jest.mocked(transfersApi.createTransfer).mockRejectedValue({
      code: 503,
      message: 'Exchange rate unavailable for EUR -> USD',
      timestamp: 'x',
    });

    renderFlow();
    await chooseDestination('dest');
    await fillAmount('50');
    await submit();

    expect(await screen.findByText("Couldn't get a rate")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeTruthy();
  });
});
