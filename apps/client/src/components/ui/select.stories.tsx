import type { Meta, StoryObj } from '@storybook/react-vite';

import { Select } from './select';

const meta = {
  title: 'UI/Select',
  component: Select.Root,
  tags: ['autodocs'],
} satisfies Meta<typeof Select.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ToAccount: Story = {
  render: () => (
    <Select.Root defaultValue="b">
      <Select.Trigger className="w-72">
        <Select.Value placeholder="Select an account" />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="a">Alan Turing · EUR</Select.Item>
        <Select.Item value="b">Margaret Hamilton · USD</Select.Item>
        <Select.Item value="c">Grace Hopper · HUF</Select.Item>
      </Select.Content>
    </Select.Root>
  ),
};

export const Placeholder: Story = {
  render: () => (
    <Select.Root>
      <Select.Trigger className="w-72">
        <Select.Value placeholder="Select an account" />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="a">Alan Turing · EUR</Select.Item>
        <Select.Item value="b">Margaret Hamilton · USD</Select.Item>
      </Select.Content>
    </Select.Root>
  ),
};
