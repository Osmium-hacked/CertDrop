import { Outlet } from 'react-router';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

export function AppLayout() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-elevated focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-[1100px] flex-1 px-4 sm:px-6">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
