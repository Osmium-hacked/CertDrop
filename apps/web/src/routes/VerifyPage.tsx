import { CERT_ID_PATTERN, VerifyResponseSchema, type VerifyResponse } from '@certdrop/shared';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '../components/ui/Button';
import { CheckIcon, ShieldIcon } from '../components/ui/icons';
import { SectionLabel } from '../components/ui/SectionLabel';
import { Skeleton } from '../components/ui/Skeleton';
import { api, ApiRequestError } from '../lib/api';
import { normalizeCertInput } from '../lib/certInput';
import { cn } from '../lib/cn';

const formatDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(undefined, { dateStyle: 'long' });

/** Public verification page: what a QR code or emailed link opens. */
export function VerifyPage() {
  const { certId } = useParams();
  const id = certId ? normalizeCertInput(certId) : null;
  const wellFormed = id !== null && CERT_ID_PATTERN.test(id);

  // Keep looked-up names out of search engines, and give the tab a useful title.
  useEffect(() => {
    document.title = 'Verify a certificate · CertDrop';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => {
      document.title = 'CertDrop';
      meta.remove();
    };
  }, []);

  const query = useQuery({
    queryKey: ['verify', id],
    queryFn: ({ signal }) => api(`/verify/${encodeURIComponent(id!)}`, VerifyResponseSchema, { signal }),
    enabled: wellFormed,
    // A 404 is an answer, not a glitch.
    retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 2,
    staleTime: 60_000,
  });

  const notFound =
    id !== null && (!wellFormed || (query.error instanceof ApiRequestError && query.error.status === 404));

  return (
    <div className="mx-auto max-w-xl pt-20 pb-8 sm:pt-28">
      <SectionLabel>Verification</SectionLabel>
      <h1 className="mt-3 text-3xl font-semibold tracking-[var(--tracking-heading)]">Verify a certificate</h1>
      <p className="mt-2 text-muted">
        Enter the certificate ID from the certificate or its email, or scan the certificate’s QR code.
      </p>

      {/* Keyed by the URL so the box resets when the lookup changes. */}
      <LookupForm key={certId ?? ''} initial={certId ?? ''} />

      <div className="mt-10" aria-live="polite">
        {id === null ? null : notFound ? (
          <NotFound id={id} />
        ) : query.isPending ? (
          <ResultSkeleton />
        ) : query.data ? (
          <Result data={query.data} />
        ) : (
          <ResultCard tone="neutral" badge="Couldn’t check" icon={<ShieldIcon />}>
            <p className="text-sm text-muted">
              {query.error instanceof ApiRequestError && query.error.status === 429
                ? 'Too many lookups from your network. Wait a minute and try again.'
                : 'We couldn’t reach the verification service. Check your connection and try again.'}
            </p>
            <Button size="sm" className="mt-4" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </ResultCard>
        )}
      </div>
    </div>
  );
}

function Result({ data }: { data: VerifyResponse }) {
  if (data.status === 'revoked') {
    const c = data.certificate;
    return (
      <ResultCard tone="danger" badge="Revoked" icon={<ShieldIcon />}>
        <p className="text-sm text-fg">
          This certificate was withdrawn by its issuer and is no longer valid.
        </p>
        <Details
          rows={[
            ['Event', c.eventName],
            ['Issued by', c.issuerName],
            ['Revoked on', formatDate(c.revokedAt)],
            ['Certificate ID', <Mono key="id">{c.id}</Mono>],
          ]}
        />
      </ResultCard>
    );
  }

  const c = data.certificate;
  return (
    <ResultCard tone="ok" badge="Valid certificate" icon={<CheckIcon strokeWidth={2} />}>
      <p className="text-[13px] text-muted">Awarded to</p>
      <p className="mt-1 text-2xl font-semibold tracking-[var(--tracking-heading)] break-words text-fg sm:text-3xl">
        {c.recipientName}
      </p>
      <Details
        rows={[
          ['Event', c.eventName],
          ['Issued by', c.issuerName],
          ['Issue date', formatDate(c.issueDate)],
          ['Certificate ID', <Mono key="id">{c.id}</Mono>],
        ]}
      />
      <p className="mt-5 text-[12px] leading-relaxed text-muted">
        This confirms that {c.issuerName} issued this certificate through CertDrop. The issuer is responsible
        for what it certifies.
      </p>
    </ResultCard>
  );
}

function NotFound({ id }: { id: string }) {
  return (
    <ResultCard tone="neutral" badge="Not found" icon={<ShieldIcon />}>
      <p className="text-sm text-fg">
        No certificate matches <Mono>{id}</Mono>.
      </p>
      <p className="mt-2 text-sm text-muted">
        Check the ID for typos (it’s case-sensitive), or ask the person who shared it for the link from their
        certificate email.
      </p>
    </ResultCard>
  );
}

const TONES = {
  ok: { ring: 'border-ok/30', badge: 'bg-ok-soft text-ok', glow: 'rgb(76 183 130 / 0.10)' },
  danger: { ring: 'border-danger/30', badge: 'bg-danger-soft text-danger', glow: 'rgb(235 87 87 / 0.08)' },
  neutral: { ring: 'border-line-strong', badge: 'bg-white/[0.06] text-muted', glow: 'transparent' },
} as const;

function ResultCard(props: {
  tone: keyof typeof TONES;
  badge: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const tone = TONES[props.tone];
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      aria-label={props.badge}
      className={cn('rounded-2xl border bg-surface p-6 sm:p-8', tone.ring)}
      style={{ backgroundImage: `radial-gradient(80% 60% at 50% 0%, ${tone.glow}, transparent)` }}
    >
      <span
        className={cn(
          'mb-5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          tone.badge,
        )}
      >
        <span aria-hidden className="[&>svg]:size-3.5">
          {props.icon}
        </span>
        {props.badge}
      </span>
      {props.children}
    </motion.section>
  );
}

function Details({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="mt-6 divide-y divide-line border-t border-line text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 py-2.5">
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 text-right break-words text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const Mono = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-[13px]">{children}</span>
);

function ResultSkeleton() {
  return (
    <div
      className="space-y-4 rounded-2xl border border-line bg-surface p-6 sm:p-8"
      aria-busy="true"
      aria-label="Checking"
    >
      <Skeleton className="h-6 w-32 rounded-full" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function LookupForm({ initial }: { initial: string }) {
  const navigate = useNavigate();
  const [input, setInput] = useState(initial);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next = normalizeCertInput(input);
    if (next) void navigate(`/verify/${encodeURIComponent(next)}`);
  };

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-2 sm:flex-row">
      <label htmlFor="cert-id" className="sr-only">
        Certificate ID
      </label>
      <input
        id="cert-id"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="CD-xxxxxxxxxx"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="h-10 flex-1 rounded-lg border border-line-strong bg-surface px-3 font-mono text-sm placeholder:text-muted/70"
      />
      <Button type="submit" variant="primary">
        Verify
      </Button>
    </form>
  );
}
