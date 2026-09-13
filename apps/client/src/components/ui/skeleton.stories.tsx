import type { Meta, StoryObj } from '@storybook/react-vite';

import { Skeleton } from './skeleton';

const meta = {
  title: 'UI/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Bar: Story = {
  args: { width: 56, height: 12 },
};

export const TransactionListLoading: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-2">
      {[0, 0.18, 0.36, 0.54].map((delay, i) => (
        <div
          key={delay}
          className="flex items-center gap-3 rounded-lg bg-surface p-3.5"
          style={i === 3 ? { opacity: 0.6 } : undefined}
        >
          <Skeleton delay={delay} width={30} height={30} className="rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton delay={delay} width="60%" height={12} />
            <Skeleton delay={delay} width="35%" height={10} />
          </div>
          <Skeleton delay={delay} width={56} height={12} />
        </div>
      ))}
    </div>
  ),
};
