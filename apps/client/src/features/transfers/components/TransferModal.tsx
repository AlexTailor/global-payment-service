import { Modal } from '@/components/ui/modal';
import type { Account } from '@/features/accounts';

import { TransferFlow } from './TransferFlow/TransferFlow';

interface TransferModalProps {
  sourceAccount: Account;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Default export so this composition can be React.lazy-loaded as one unit from PageShell —
// TransferFlow itself is a plain object of named components, not suited to lazy() directly.
export default function TransferModal({ sourceAccount, open, onOpenChange }: TransferModalProps) {
  return (
    <TransferFlow.Provider sourceAccount={sourceAccount}>
      <Modal.Root open={open} onOpenChange={onOpenChange}>
        <TransferFlow.Form />
        <TransferFlow.Pending />
        <TransferFlow.Success />
        <TransferFlow.Failed />
      </Modal.Root>
    </TransferFlow.Provider>
  );
}
