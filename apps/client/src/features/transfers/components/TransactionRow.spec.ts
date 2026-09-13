import { getTransactionReference, getTransactionRowData } from './TransactionRow';
import type { Transfer } from '../types';
import type { Account } from '@/features/accounts';

const accounts: Account[] = [
  { id: 'viewer', ownerName: 'Me', currency: 'EUR', balance: 500 },
  { id: 'other', ownerName: 'Alan Turing', currency: 'USD', balance: 200 },
];

function transfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: '8f2a19b4-c0de-4dad-b00b-1234567890c41',
    fromAccountId: 'viewer',
    toAccountId: 'other',
    amount: 100,
    sourceCurrency: 'EUR',
    targetCurrency: 'USD',
    exchangeRate: null,
    status: 'COMPLETED',
    createdAt: '2026-01-01T12:00:00Z',
    ...overrides,
  };
}

describe('getTransactionReference', () => {
  it('truncates the transfer id to an 8-char prefix and 3-char suffix', () => {
    expect(getTransactionReference('8f2a19b4-c0de-4dad-b00b-1234567890c41')).toBe(
      '8f2a19b4…c41',
    );
  });
});

describe('getTransactionRowData', () => {
  it('treats the viewer as the sender for an outgoing transfer', () => {
    const row = getTransactionRowData(transfer(), 'viewer', accounts);

    expect(row.direction).toBe('out');
    expect(row.counterpartyName).toBe('Alan Turing');
    expect(row.counterpartyCurrency).toBe('USD');
    expect(row.viewerCurrency).toBe('EUR');
    expect(row.signedAmount).toBe(-100);
  });

  it('treats the viewer as the recipient for an incoming transfer', () => {
    const row = getTransactionRowData(
      transfer({ fromAccountId: 'other', toAccountId: 'viewer' }),
      'viewer',
      accounts,
    );

    expect(row.direction).toBe('in');
    expect(row.counterpartyName).toBe('Alan Turing');
    expect(row.viewerCurrency).toBe('USD');
  });

  it('converts the amount at the exchange rate for an incoming cross-currency transfer', () => {
    const row = getTransactionRowData(
      transfer({ fromAccountId: 'other', toAccountId: 'viewer', amount: 100, exchangeRate: 1.08 }),
      'viewer',
      accounts,
    );

    expect(row.signedAmount).toBeCloseTo(108);
    expect(row.secondLine).toBe('€100.00 · árfolyam: 1.0800');
  });

  it('does not convert a same-currency incoming transfer', () => {
    const row = getTransactionRowData(
      transfer({ fromAccountId: 'other', toAccountId: 'viewer', amount: 50, exchangeRate: null }),
      'viewer',
      accounts,
    );

    expect(row.signedAmount).toBe(50);
  });

  it('shows "Resolving rate" while a cross-currency transfer is processing', () => {
    const row = getTransactionRowData(
      transfer({ status: 'PROCESSING', sourceCurrency: 'EUR', targetCurrency: 'USD' }),
      'viewer',
      accounts,
    );

    expect(row.secondLine).toBe('Árfolyam lekérése');
  });

  it('shows "Moving funds" while a same-currency transfer is processing', () => {
    const row = getTransactionRowData(
      transfer({ status: 'PROCESSING', sourceCurrency: 'EUR', targetCurrency: 'EUR' }),
      'viewer',
      accounts,
    );

    expect(row.secondLine).toBe('Pénz mozgatása');
  });

  it('shows a generic failure line for a failed transfer', () => {
    const row = getTransactionRowData(transfer({ status: 'FAILED' }), 'viewer', accounts);
    expect(row.secondLine).toBe('Sikertelen utalás');
  });

  it('falls back to the reference as the second line otherwise', () => {
    const row = getTransactionRowData(transfer(), 'viewer', accounts);
    expect(row.secondLine).toBe(row.reference);
  });

  it('falls back gracefully when the counterparty account is not in the accounts list', () => {
    const row = getTransactionRowData(
      transfer({ toAccountId: 'unknown-account' }),
      'viewer',
      accounts,
    );

    expect(row.counterpartyName).toBe('Ismeretlen');
    expect(row.counterpartyCurrency).toBe(row.viewerCurrency);
  });
});
