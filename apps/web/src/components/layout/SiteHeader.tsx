import { Link } from 'react-router';
import { ShieldIcon } from '../ui/icons';
import { Logo } from '../ui/Logo';

export function SiteHeader() {
  return (
    <header className="relative z-10 border-b border-line">
      <div className="mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between px-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded-md text-[15px] font-semibold tracking-[-0.01em]"
        >
          <Logo className="size-7" />
          CertDrop
        </Link>
        <Link
          to="/verify"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted transition-colors hover:text-fg"
        >
          <ShieldIcon />
          Verify a certificate
        </Link>
      </div>
    </header>
  );
}
