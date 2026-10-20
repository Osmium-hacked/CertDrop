import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ShieldIcon } from '../components/ui/icons';
import { SectionLabel } from '../components/ui/SectionLabel';

/**
 * Public verification page. /verify shows a lookup form; /verify/:certId shows the result.
 * The lookup itself (GET /api/verify/:certId) is wired up in milestone 6.
 */
export function VerifyPage() {
  const { certId } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(certId ?? '');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const id = input.trim();
    if (id) void navigate(`/verify/${encodeURIComponent(id)}`);
  };

  return (
    <div className="mx-auto max-w-xl pt-20 sm:pt-28">
      <SectionLabel>Verification</SectionLabel>
      <h1 className="mt-3 text-3xl font-semibold tracking-[var(--tracking-heading)]">Verify a certificate</h1>
      <p className="mt-2 text-muted">
        Enter the certificate ID printed on the certificate, or scan its QR code.
      </p>

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
          spellCheck={false}
          className="h-10 flex-1 rounded-lg border border-line-strong bg-surface px-3 font-mono text-sm placeholder:text-muted/70"
        />
        <Button type="submit" variant="primary">
          Verify
        </Button>
      </form>

      {certId && (
        <div className="mt-10">
          <EmptyState
            icon={<ShieldIcon />}
            title="Lookup coming soon"
            description={`Verification for ${certId} goes live in milestone 6.`}
          />
        </div>
      )}
    </div>
  );
}
