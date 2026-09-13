import type { Currency } from '@/types/api';

const LOCALE_BY_CURRENCY: Record<Currency, string> = {
  EUR: 'en-US',
  USD: 'en-US',
  HUF: 'hu-HU',
};

export function formatCurrency(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency], {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'HUF' ? 0 : 2,
  }).format(amount);
}
