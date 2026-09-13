import { formatCurrency } from './currency';

describe('formatCurrency', () => {
  it('formats EUR with a prefixed symbol, 2 decimals, comma thousands', () => {
    expect(formatCurrency(4182.6, 'EUR')).toBe('€4,182.60');
  });

  it('formats USD with a prefixed symbol, 2 decimals, comma thousands', () => {
    expect(formatCurrency(1940, 'USD')).toBe('$1,940.00');
  });

  it('formats HUF with a suffixed symbol, 0 decimals, space thousands', () => {
    expect(formatCurrency(1620000, 'HUF')).toBe('1 620 000 Ft');
  });
});
