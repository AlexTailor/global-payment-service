import type { Meta, StoryObj } from '@storybook/react-vite';

import { SegmentedControl } from './segmented-control';

const meta = {
  title: 'UI/SegmentedControl',
  component: SegmentedControl.Root,
  tags: ['autodocs'],
} satisfies Meta<typeof SegmentedControl.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Currency: Story = {
  render: () => (
    <SegmentedControl.Root defaultValue="EUR" className="w-72">
      <SegmentedControl.Option value="EUR">EUR</SegmentedControl.Option>
      <SegmentedControl.Option value="USD">USD</SegmentedControl.Option>
      <SegmentedControl.Option value="HUF">HUF</SegmentedControl.Option>
    </SegmentedControl.Root>
  ),
};
