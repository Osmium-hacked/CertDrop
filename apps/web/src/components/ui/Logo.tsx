/** CertDrop mark: a document with a check. Original artwork, kept in sync with public/favicon.svg. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" fill="#16171a" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#fff" strokeOpacity="0.12" />
      <path
        d="M9 7.5h10.5L23 11v13.5H9z"
        fill="none"
        stroke="#b4abff"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 17l2.4 2.4 4.6-4.9"
        fill="none"
        stroke="#f7f8f8"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
