import { Badge } from '@/components/ui/badge';

import type { TransferStatus } from '../types';

const LABEL: Record<TransferStatus, string> = {
  COMPLETED: 'Teljesítve',
  PROCESSING: 'Folyamatban',
  FAILED: 'Sikertelen',
};

const VARIANT: Record<TransferStatus, 'completed' | 'processing' | 'failed'> = {
  COMPLETED: 'completed',
  PROCESSING: 'processing',
  FAILED: 'failed',
};

export function StatusBadge({ status }: { status: TransferStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
