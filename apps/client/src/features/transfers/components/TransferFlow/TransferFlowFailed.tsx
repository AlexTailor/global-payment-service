import { AlertCircle, RotateCw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Typography } from '@/components/ui/typography';

import { useTransferFlow } from './TransferFlowContext';

export function TransferFlowFailed() {
  const {
    state: { step, error },
    actions: { retry, editAmount, reset },
  } = useTransferFlow();

  if (step !== 'failed' || !error) return null;

  const is409 = error.code === 409;
  const is503 = error.code === 503;

  return (
    <Modal.Content>
      <Modal.Header className="items-center text-center">
        <div
          className={
            is409
              ? 'mx-auto flex size-11 items-center justify-center rounded-full border border-failure'
              : 'mx-auto flex size-11 items-center justify-center rounded-full border border-neutral-600'
          }
        >
          {is409 ? (
            <X className="size-5 text-failure-text" aria-hidden />
          ) : (
            <AlertCircle className="size-5 text-neutral-400" aria-hidden />
          )}
        </div>
        <Modal.Title>{is503 ? "Couldn't get a rate" : 'Transfer failed'}</Modal.Title>
        <Typography variant="error">{error.message}</Typography>
        {is409 && <Typography variant="caption">Nothing was moved.</Typography>}
      </Modal.Header>
      <Modal.Body>
        <div className="flex flex-col gap-2 rounded-lg border border-divider px-3.5 py-2.5">
          <Typography variant="caption">FAILED · {error.code}</Typography>
          <Typography variant="caption">
            {is409
              ? 'Retrying reuses the same idempotency key — it reclaims this attempt rather than creating a second one.'
              : 'Safe to retry — same key, same transfer row.'}
          </Typography>
        </div>
      </Modal.Body>
      <Modal.Footer>
        {is409 && (
          <>
            <Button variant="secondary" size="lg" onClick={editAmount}>
              Edit amount
            </Button>
            <Button size="lg" onClick={retry}>
              <RotateCw data-icon="inline-start" className="size-4" aria-hidden />
              Try again
            </Button>
          </>
        )}
        {is503 && (
          <>
            <Modal.Close render={<Button variant="secondary" size="lg" onClick={reset} />}>
              Close
            </Modal.Close>
            <Button size="lg" onClick={retry}>
              Retry now
            </Button>
          </>
        )}
        {!is409 && !is503 && (
          <Modal.Close render={<Button size="lg" onClick={reset} />}>Close</Modal.Close>
        )}
      </Modal.Footer>
    </Modal.Content>
  );
}
