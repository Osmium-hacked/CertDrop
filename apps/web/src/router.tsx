import { createBrowserRouter } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { HomePage } from './routes/HomePage';

// The wizard, the public verification page and the privacy policy. The verify page is split into
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
      {
        path: 'privacy',
        lazy: async () => {
          const { PrivacyPage } = await import('./routes/PrivacyPage');
          return { Component: PrivacyPage };
        },
      },
    ],
  },
]);
