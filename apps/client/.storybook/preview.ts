import type { Preview } from '@storybook/react-vite';

import '../src/styles.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'nocturne',
      values: [{ name: 'nocturne', value: '#161826' }],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
