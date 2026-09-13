import type { Meta, StoryObj } from '@storybook/react-vite';

import { Typography } from './typography';

const meta = {
  title: 'UI/Typography',
  component: Typography,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['body', 'caption', 'label', 'eyebrow', 'mono', 'amount', 'error'],
    },
  },
} satisfies Meta<typeof Typography>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Body: Story = {
  args: { variant: 'body', children: 'Alan Turing · EUR' },
};

export const Caption: Story = {
  args: { variant: 'caption', children: 'Today, 14:32 · Rent' },
};

export const Label: Story = {
  args: { variant: 'label', children: 'Alan Turing · EUR' },
};

export const Eyebrow: Story = {
  args: { variant: 'eyebrow', children: 'Switch account' },
};

export const Mono: Story = {
  args: { variant: 'mono', children: '8f2a19b4…c41' },
};

export const Amount: Story = {
  args: { variant: 'amount', className: 'text-lg', children: '€4,182.60' },
};

export const ErrorText: Story = {
  args: { variant: 'error', children: 'Owner name is required.' },
};

export const AllVariants: Story = {
  args: { children: '' },
  render: () => (
    <div className="flex flex-col gap-2">
      <Typography variant="body">Body — Alan Turing · EUR</Typography>
      <Typography variant="caption">Caption — Today, 14:32 · Rent</Typography>
      <Typography variant="label">Label — Alan Turing · EUR</Typography>
      <Typography variant="eyebrow">Eyebrow — Switch account</Typography>
      <Typography variant="mono">Mono — 8f2a19b4…c41</Typography>
      <Typography variant="amount" className="text-lg">
        Amount — €4,182.60
      </Typography>
      <Typography variant="error">Error — Owner name is required.</Typography>
    </div>
  ),
};
