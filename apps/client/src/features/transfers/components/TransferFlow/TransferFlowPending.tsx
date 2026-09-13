import { Check, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Typography } from '@/components/ui/typography';

import { useTransferFlow } from './TransferFlowContext';

export function TransferFlowPending() {
  const {
    state: { step },
  } = useTransferFlow();

  if (step !== 'pending') return null;

  // The backend resolves the whole request atomically — there's no real progress signal
  // to distinguish "resolving rate" from "moving funds" mid-flight, so this stays a
  // two-item checklist rather than a granular, falsely-precise sequence.
  return (
    <Modal.Content showCloseButton={false}>
      <Modal.Header>
        <Modal.Title>Új utalás</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="flex flex-col gap-3 rounded-lg bg-bg p-3.5">
          <div className="flex items-center gap-2.5">
            <Check className="size-4 text-accent" aria-hidden />
            <Typography variant="body">Utalás elfogadva</Typography>
          </div>
          <div className="flex items-center gap-2.5">
            <Loader2 className="size-4 animate-spin text-accent-400" aria-hidden />
            <Typography variant="body">Pénz mozgatása</Typography>
          </div>
        </div>
        <Typography variant="caption">
          Ez néhány másodpercet vehet igénybe. Ne zárd be az alkalmazást.
        </Typography>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" variant="secondary" size="lg" disabled>
          Mégse
        </Button>
        <Button type="button" size="lg" loading>
          Küldés…
        </Button>
      </Modal.Footer>
    </Modal.Content>
  );
}
