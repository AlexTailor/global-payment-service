import { act, renderHook } from '@testing-library/react';

import { useSelectedAccount } from './useSelectedAccount';
import type { Account } from '../types';

function account(id: string): Account {
  return { id, ownerName: 'Owner', currency: 'EUR', balance: 0 };
}

describe('useSelectedAccount', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('falls back to the first account when nothing is stored', () => {
    const { result } = renderHook(() => useSelectedAccount([account('a'), account('b')]));
    expect(result.current.selectedId).toBe('a');
  });

  it('falls back to the first account when the stored id no longer exists', () => {
    localStorage.setItem('selectedAccountId:v1', 'deleted-account');
    const { result } = renderHook(() => useSelectedAccount([account('a'), account('b')]));
    expect(result.current.selectedId).toBe('a');
  });

  it('uses the stored id when it matches a current account', () => {
    localStorage.setItem('selectedAccountId:v1', 'b');
    const { result } = renderHook(() => useSelectedAccount([account('a'), account('b')]));
    expect(result.current.selectedId).toBe('b');
  });

  it('persists a new selection to localStorage under the versioned key', () => {
    const { result } = renderHook(() => useSelectedAccount([account('a'), account('b')]));

    act(() => result.current.select('b'));

    expect(result.current.selectedId).toBe('b');
    expect(localStorage.getItem('selectedAccountId:v1')).toBe('b');
  });

  it('returns undefined when there are no accounts', () => {
    const { result } = renderHook(() => useSelectedAccount([]));
    expect(result.current.selectedId).toBeUndefined();
  });

  it('does not throw when localStorage is unavailable', () => {
    const original = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
      configurable: true,
    });

    const { result } = renderHook(() => useSelectedAccount([account('a')]));
    expect(result.current.selectedId).toBe('a');
    expect(() => act(() => result.current.select('a'))).not.toThrow();

    Object.defineProperty(window, 'localStorage', { value: original, configurable: true });
  });
});
