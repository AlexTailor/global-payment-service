import type { Meta, StoryObj } from '@storybook/react-vite';

import { Dialog } from './dialog';
import { Button } from './button';

const meta = {
  title: 'UI/Dialog',
  component: Dialog.Root,
  tags: ['autodocs'],
} satisfies Meta<typeof Dialog.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  render: () => (
    <Dialog.Root>
      <Dialog.Trigger render={<Button>Open dialog</Button>} />
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Delete account</Dialog.Title>
          <Dialog.Description>
            This action cannot be undone.
          </Dialog.Description>
        </Dialog.Header>
        <Dialog.Footer showCloseButton>
          <Button variant="primary">Delete</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  ),
};

export const Open: Story = {
  render: () => (
    <Dialog.Root defaultOpen>
      <Dialog.Trigger render={<Button>Open dialog</Button>} />
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Delete account</Dialog.Title>
          <Dialog.Description>
            This action cannot be undone.
          </Dialog.Description>
        </Dialog.Header>
        <Dialog.Footer showCloseButton>
          <Button variant="primary">Delete</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  ),
};
