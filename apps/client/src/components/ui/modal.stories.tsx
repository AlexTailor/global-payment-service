import type { Meta, StoryObj } from '@storybook/react-vite';

import { Modal } from './modal';
import { Button } from './button';

const meta = {
  title: 'UI/Modal',
  component: Modal.Root,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Below 768px width, Root renders as a bottom sheet; at/above, a centered dialog. Switch the viewport toolbar to see both presentations.',
      },
    },
  },
} satisfies Meta<typeof Modal.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  render: () => (
    <Modal.Root>
      <Modal.Trigger render={<Button>New transfer</Button>} />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>New transfer</Modal.Title>
          <Modal.Description>Send money to another account</Modal.Description>
        </Modal.Header>
        <Modal.Body>Form content goes here.</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary">Cancel</Button>
          <Button>Confirm</Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  ),
};

export const Open: Story = {
  render: () => (
    <Modal.Root defaultOpen>
      <Modal.Trigger render={<Button>New transfer</Button>} />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>New transfer</Modal.Title>
          <Modal.Description>Send money to another account</Modal.Description>
        </Modal.Header>
        <Modal.Body>Form content goes here.</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary">Cancel</Button>
          <Button>Confirm</Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  ),
};
