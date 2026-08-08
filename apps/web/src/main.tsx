import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { LoadingScreen } from './components/LoadingScreen';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <React.Suspense fallback={<LoadingScreen error={null} onRetry={() => window.location.reload()} />}>
        <App />
      </React.Suspense>
    </QueryClientProvider>
  </React.StrictMode>,
);
