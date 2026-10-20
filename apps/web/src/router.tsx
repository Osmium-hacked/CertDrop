import { createBrowserRouter } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { HomePage } from './routes/HomePage';

// Two routes only: the wizard and the public verification page. The verify page is split into
// its own chunk because recipients who scan a QR code never need the editor or CSV code.
export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'verify/:certId?',
        lazy: async () => {
          const { VerifyPage } = await import('./routes/VerifyPage');
          return { Component: VerifyPage };
        },
      },
    ],
  },
]);
