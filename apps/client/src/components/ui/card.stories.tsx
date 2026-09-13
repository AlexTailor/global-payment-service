import type { Meta, StoryObj } from '@storybook/react-vite';

import { Card } from './card';
import { Badge } from './badge';
import { StatusIcon } from './status-icon';

const meta = {
  title: 'UI/Card',
  component: Card.Root,
  tags: ['autodocs'],
} satisfies Meta<typeof Card.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {
  render: () => <Card.Root className="w-80 p-3.5">Card content</Card.Root>,
};

export const TransactionRow: Story = {
  render: () => (
    <Card.Root className="w-80 flex-row items-center gap-3 px-3.5">
      <StatusIcon status="COMPLETED" direction="in" />
      <div className="flex flex-1 flex-col">
        <span className="text-sm">Anna Kovács · EUR</span>
        <span className="text-xs text-neutral-600">Today, 14:32 · Rent</span>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-sm tabular-nums">+€250.00</span>
        <Badge variant="completed">Completed</Badge>
      </div>
    </Card.Root>
  ),
};
