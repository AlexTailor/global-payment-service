import { QueryClientProvider } from '@tanstack/react-query';

import { PageShell } from '@/components/PageShell';

import { queryClient } from './query-client';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PageShell />
    </QueryClientProvider>
  );
}

export default App;
