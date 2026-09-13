import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatusIcon } from './status-icon';

const meta = {
  title: 'UI/StatusIcon',
  component: StatusIcon,
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'radio',
      options: ['COMPLETED', 'PROCESSING', 'FAILED'],
    },
    direction: {
      control: 'radio',
      options: ['in', 'out'],
    },
  },
} satisfies Meta<typeof StatusIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompletedIn: Story = {
  args: { status: 'COMPLETED', direction: 'in' },
};

export const CompletedOut: Story = {
  args: { status: 'COMPLETED', direction: 'out' },
};

export const Processing: Story = {
  args: { status: 'PROCESSING', direction: 'out' },
};

export const Failed: Story = {
  args: { status: 'FAILED', direction: 'out' },
};

export const AllVariants: Story = {
  args: { status: 'COMPLETED', direction: 'out' },
  render: () => (
    <div className="flex gap-3">
      <StatusIcon status="COMPLETED" direction="in" />
      <StatusIcon status="COMPLETED" direction="out" />
      <StatusIcon status="PROCESSING" direction="out" />
      <StatusIcon status="FAILED" direction="out" />
    </div>
  ),
};
