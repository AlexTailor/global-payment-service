import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from './query-client';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div>Global Payment Service</div>
    </QueryClientProvider>
  );
}

export default App;
