import { useCallback, useState } from 'react';

import type { Account } from '../types';

const STORAGE_KEY = 'selectedAccountId:v1';

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private browsing / quota exceeded — selection just won't survive a reload.
  }
}

export function useSelectedAccount(accounts: Account[]) {
  const [storedId, setStoredId] = useState<string | null>(readStoredId);

  // Falling back to the first account when the stored id is stale (deleted account,
  // never selected before) is derived every render rather than synced via an effect —
  // there's no separate piece of state that could drift from `accounts`.
  const selectedId = accounts.some((account) => account.id === storedId)
    ? (storedId as string)
    : accounts[0]?.id;

  const select = useCallback((id: string) => {
    setStoredId(id);
    writeStoredId(id);
  }, []);

  return { selectedId, select } as const;
}
