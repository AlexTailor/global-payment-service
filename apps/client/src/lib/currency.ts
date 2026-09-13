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

const SYMBOL_BY_CURRENCY: Record<Currency, string> = {
  EUR: '€',
  USD: '$',
  HUF: 'Ft',
};

// Bare symbol for an input adornment (e.g. "€" to the left of an amount field) —
// formatCurrency is for rendering an already-known value, not labelling an input.
export function getCurrencySymbol(currency: Currency): string {
  return SYMBOL_BY_CURRENCY[currency];
}
