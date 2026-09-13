import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import * as accountsApi from '../api/accounts.api';
import { NewAccountModal } from './NewAccountModal';

jest.mock('../api/accounts.api');

function renderModal(onCreated = jest.fn()) {
  const queryClient = new QueryClient();
  const onOpenChange = jest.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <NewAccountModal open onOpenChange={onOpenChange} onCreated={onCreated} />
    </QueryClientProvider>,
  );

  return { onCreated, onOpenChange };
}

describe('NewAccountModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('disables submit and shows a validation error for a blank owner name', async () => {
    renderModal();

    const ownerNameInput = screen.getByPlaceholderText('Tulajdonos neve');
    fireEvent.blur(ownerNameInput);

    expect(await screen.findByText('A tulajdonos neve kötelező.')).toBeTruthy();
    const submitButton = screen.getByRole('button', { name: 'Számla létrehozása' }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });

  it('shows a validation error for a negative opening balance', async () => {
    renderModal();

    const balanceInput = screen.getByPlaceholderText('0');
    fireEvent.change(balanceInput, { target: { value: '-5' } });
    fireEvent.blur(balanceInput);

    expect(await screen.findByText('Az összeg nulla vagy nagyobb kell legyen.')).toBeTruthy();
  });

  it('submits the form and reports the created account id', async () => {
    const createdAccount = { id: 'new-id', ownerName: 'Ada Lovelace', currency: 'EUR' as const, balance: 100 };
    jest.mocked(accountsApi.createAccount).mockResolvedValue(createdAccount);
    const { onCreated } = renderModal();

    const ownerNameInput = screen.getByPlaceholderText('Tulajdonos neve');
    fireEvent.change(ownerNameInput, { target: { value: 'Ada Lovelace' } });
    fireEvent.blur(ownerNameInput);
    await waitFor(() => expect(screen.queryByText('A tulajdonos neve kötelező.')).toBeNull());

    const balanceInput = screen.getByPlaceholderText('0');
    fireEvent.change(balanceInput, { target: { value: '100' } });
    fireEvent.blur(balanceInput);
    await waitFor(() => expect(screen.queryByText('Az összeg megadása kötelező.')).toBeNull());

    const submitButton = await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Számla létrehozása' }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      return button;
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(accountsApi.createAccount).toHaveBeenCalledWith(
        { ownerName: 'Ada Lovelace', currency: 'EUR', initialBalance: 100 },
        expect.anything(),
      );
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-id'));
  });
});
