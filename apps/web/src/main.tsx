import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* "user" turns transform/layout animations off when the OS asks for reduced motion. */}
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
