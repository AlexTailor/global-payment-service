export type Currency = 'EUR' | 'USD' | 'HUF';

export type TransferStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface AccountResponse {
  id: string;
  ownerName: string;
  currency: Currency;
  balance: number;
}

export interface CreateAccountRequest {
  ownerName: string;
  currency: Currency;
  initialBalance: number;
}

export interface TransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: Currency;
}

export interface TransferResponse {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  sourceCurrency: Currency;
  targetCurrency: Currency;
  exchangeRate: number | null;
  status: TransferStatus;
  createdAt: string;
}

export interface ApiError {
  code: number;
  message: string;
  timestamp: string;
}
