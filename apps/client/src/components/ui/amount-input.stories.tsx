import type { Meta, StoryObj } from '@storybook/react-vite';

import { AmountInput } from './amount-input';

const meta = {
  title: 'UI/AmountInput',
  component: AmountInput,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'radio',
      options: ['default', 'lg'],
    },
    currency: {
      control: 'radio',
      options: ['EUR', 'USD', 'HUF'],
    },
  },
  args: {
    currency: 'EUR',
  },
} satisfies Meta<typeof AmountInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { defaultValue: '250' },
};

export const Large: Story = {
  args: { size: 'lg', defaultValue: '250' },
};

export const Invalid: Story = {
  args: { invalid: true, defaultValue: '-5' },
};

export const HUF: Story = {
  args: { currency: 'HUF', defaultValue: '1620000' },
};
