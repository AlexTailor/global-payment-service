import type { Meta, StoryObj } from '@storybook/react-vite';

import { Input } from './input';

const meta = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  args: {
    placeholder: 'Amount',
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
  args: { defaultValue: '1,250.00' },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: '1,250.00' },
};

export const Invalid: Story = {
  args: { 'aria-invalid': true, defaultValue: 'not a number' },
};
