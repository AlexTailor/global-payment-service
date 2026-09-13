import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { Modal } from '@/components/ui/modal';

import * as accountsApi from '../api/accounts.api';
import { AccountSwitcher } from './AccountSwitcher';

jest.mock('../api/accounts.api');
jest.mock('@/features/transfers', () => ({
  useTransfers: () => ({ isFetching: false }),
}));

const accounts = [
  { id: 'a', ownerName: 'Alice', currency: 'EUR' as const, balance: 100 },
  { id: 'b', ownerName: 'Bob', currency: 'USD' as const, balance: 200 },
];

function renderSwitcher() {
  const queryClient = new QueryClient();
  jest.mocked(accountsApi.getAccounts).mockResolvedValue(accounts);

  return render(
    <QueryClientProvider client={queryClient}>
      <AccountSwitcher.Provider>
        <Modal.Root defaultOpen>
          <AccountSwitcher.Trigger />
          <AccountSwitcher.Panel />
        </Modal.Root>
      </AccountSwitcher.Provider>
    </QueryClientProvider>,
  );
}

describe('AccountSwitcher', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('selects the first account by default', async () => {
    renderSwitcher();
    expect(await screen.findByText('Alice · EUR')).toBeTruthy();
  });

  it('uses a previously persisted selection over the first account', async () => {
    localStorage.setItem('selectedAccountId:v1', 'b');
    renderSwitcher();
    expect(await screen.findByText('Bob · USD')).toBeTruthy();
  });

  it('selects a different account on row click and persists it', async () => {
    renderSwitcher();
    await screen.findByText('Alice · EUR');

    const bobRow = screen.getByText('Bob').closest('button');
    fireEvent.click(bobRow!);

    await waitFor(() => {
      expect(localStorage.getItem('selectedAccountId:v1')).toBe('b');
    });
    expect(await screen.findByText('Bob · USD')).toBeTruthy();
  });

  it('opens the New account modal from the panel action', async () => {
    renderSwitcher();
    fireEvent.click(await screen.findByText('Új számla'));

    expect(await screen.findByRole('heading', { name: 'Új számla' })).toBeTruthy();
  });
});
