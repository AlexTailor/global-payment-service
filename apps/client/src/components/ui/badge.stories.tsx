import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from './badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'radio',
      options: ['completed', 'processing', 'failed'],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Completed: Story = {
  args: { variant: 'completed', children: 'Completed' },
};

export const Processing: Story = {
  args: { variant: 'processing', children: 'Processing' },
};

export const Failed: Story = {
  args: { variant: 'failed', children: 'Failed' },
};

export const AllStatuses: Story = {
  args: { children: 'Completed' },
  render: () => (
    <div className="flex gap-2">
      <Badge variant="completed">Completed</Badge>
      <Badge variant="processing">Processing</Badge>
      <Badge variant="failed">Failed</Badge>
    </div>
  ),
};
