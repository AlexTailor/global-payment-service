import { render } from '@testing-library/react';

import { Badge } from './badge';
import { Button } from './button';
import { Card } from './card';
import { Input } from './input';
import { Modal } from './modal';
import { SegmentedControl } from './segmented-control';
import { Skeleton } from './skeleton';
import { StatusIcon } from './status-icon';

describe('UI primitives', () => {
  it('render without throwing', () => {
    const { baseElement } = render(
      <>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button loading>Loading</Button>
        <Badge variant="completed">Completed</Badge>
        <Badge variant="processing">Processing</Badge>
        <Badge variant="failed">Failed</Badge>
        <StatusIcon status="COMPLETED" direction="in" />
        <StatusIcon status="PROCESSING" direction="out" />
        <StatusIcon status="FAILED" direction="out" />
        <Card.Root>Card content</Card.Root>
        <Input placeholder="Amount" />
        <Skeleton width={56} height={12} />
        <SegmentedControl.Root defaultValue="EUR">
          <SegmentedControl.Option value="EUR">EUR</SegmentedControl.Option>
          <SegmentedControl.Option value="USD">USD</SegmentedControl.Option>
          <SegmentedControl.Option value="HUF">HUF</SegmentedControl.Option>
        </SegmentedControl.Root>
        <Modal.Root>
          <Modal.Trigger render={<Button>Open</Button>} />
          <Modal.Content>
            <Modal.Header>
              <Modal.Title>Title</Modal.Title>
              <Modal.Description>Description</Modal.Description>
            </Modal.Header>
            <Modal.Body>Body</Modal.Body>
            <Modal.Footer>
              <Button variant="secondary">Cancel</Button>
              <Button>Confirm</Button>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      </>,
    );

    expect(baseElement).toBeTruthy();
  });
});
