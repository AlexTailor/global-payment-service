import { render, screen } from '@testing-library/react';

import type { Account } from '@/features/accounts';

import type { Transfer } from '../types';
import { TransactionList } from './TransactionList';
import { TransactionTable } from './TransactionTable';

const accounts: Account[] = [
  { id: 'viewer', ownerName: 'Me', currency: 'EUR', balance: 500 },
  { id: 'other', ownerName: 'Alan Turing', currency: 'USD', balance: 200 },
];

const transfers: Transfer[] = [
  {
    id: '8f2a19b4-c0de-4dad-b00b-1234567890c41',
    fromAccountId: 'viewer',
    toAccountId: 'other',
    amount: 100,
    sourceCurrency: 'EUR',
    targetCurrency: 'USD',
    exchangeRate: 1.08,
    status: 'COMPLETED',
    createdAt: '2026-01-01T12:00:00Z',
  },
];

describe('TransactionList', () => {
  it('renders a card row per transfer', () => {
    render(<TransactionList transfers={transfers} viewerAccountId="viewer" accounts={accounts} />);

    expect(screen.getByText('Alan Turing · USD')).toBeTruthy();
    expect(screen.getByText('-€100.00')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
  });
});

describe('TransactionTable', () => {
  it('renders a row per transfer with rate and reference columns', () => {
    render(<TransactionTable transfers={transfers} viewerAccountId="viewer" accounts={accounts} />);

    expect(screen.getByText('Alan Turing · USD')).toBeTruthy();
    expect(screen.getByText('1.0800')).toBeTruthy();
    expect(screen.getByText('8f2a19b4…c41')).toBeTruthy();
  });
});
