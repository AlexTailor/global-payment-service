import { TransferFlowProvider } from './TransferFlowProvider';
import { TransferFlowForm } from './TransferFlowForm';
import { TransferFlowPending } from './TransferFlowPending';
import { TransferFlowSuccess } from './TransferFlowSuccess';
import { TransferFlowFailed } from './TransferFlowFailed';

export const TransferFlow = {
  Provider: TransferFlowProvider,
  Form: TransferFlowForm,
  Pending: TransferFlowPending,
  Success: TransferFlowSuccess,
  Failed: TransferFlowFailed,
};
