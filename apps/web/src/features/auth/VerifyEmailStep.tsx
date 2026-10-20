import { EmailSchema, OTP_POLICY } from '@certdrop/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { CheckIcon } from '../../components/ui/icons';
import { Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { ApiRequestError } from '../../lib/api';
import { formatSeconds, useCountdown } from '../../lib/useCountdown';
import { CodeInput } from './CodeInput';
import { useRequestCode, useSession, useSignOut, useVerifyCode } from './session';
import { TurnstileWidget } from './TurnstileWidget';
import { useTurnstile, type TurnstileState } from './useTurnstile';

const errorMessage = (err: unknown) =>
  err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.';

/** Step 1: prove control of the organizer email with a one-time code. */
export function VerifyEmailStep({ onVerified }: { onVerified: () => void }) {
  const session = useSession();

  if (session.isPending) {
    return (
      <div className="max-w-sm space-y-3" aria-busy="true" aria-label="Checking your session">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-8 w-28" />
      </div>
    );
  }

  const organizer = session.data?.organizer;
  if (organizer) return <SignedIn email={organizer.email} />;
  return <SignInFlow onVerified={onVerified} />;
}

/** Email form, then code form. Owns the Turnstile widget so it survives the switch between them. */
function SignInFlow({ onVerified }: { onVerified: () => void }) {
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const turnstile = useTurnstile();

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pendingEmail ? 'code' : 'email'}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.16 }}
        >
          {pendingEmail ? (
            <CodeForm
              email={pendingEmail}
              onChangeEmail={() => setPendingEmail(null)}
              onVerified={onVerified}
              turnstile={turnstile}
            />
          ) : (
            <EmailForm onSent={setPendingEmail} turnstile={turnstile} />
          )}
        </motion.div>
      </AnimatePresence>
      <TurnstileWidget enabled={turnstile.enabled} failed={turnstile.failed} mount={turnstile.mount} />
    </div>
  );
}

function EmailForm({ onSent, turnstile }: { onSent: (email: string) => void; turnstile: TurnstileState }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const request = useRequestCode();
  const waitingForCheck = turnstile.enabled && !turnstile.token;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = EmailSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address');
      return;
    }
    setError(undefined);
    request.mutate(
      { email: parsed.data, captchaToken: turnstile.token ?? undefined },
      {
        // Each token works once, whatever the outcome.
        onSettled: turnstile.reset,
        onSuccess: () => onSent(parsed.data),
        onError: (err) => {
          // Already have a live code for this address: go straight to entering it.
          if (err instanceof ApiRequestError && err.code === 'OTP_COOLDOWN') {
            toast.info('We sent you a code moments ago. Check your inbox.');
            onSent(parsed.data);
            return;
          }
          toast.error(errorMessage(err));
        },
      },
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-sm">
      <TextField
        label="Your email"
        type="email"
        name="email"
        autoComplete="email"
        placeholder="you@organization.org"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        error={error}
        hint="Certificates are sent on your behalf, with replies going to this address."
        autoFocus
      />
      <Button
        type="submit"
        variant="primary"
        className="mt-4"
        disabled={request.isPending || waitingForCheck}
        title={waitingForCheck ? 'Waiting for the human check below' : undefined}
      >
        {request.isPending && <Spinner />}
        Send code
      </Button>
    </form>
  );
}

function CodeForm({
  email,
  onChangeEmail,
  onVerified,
  turnstile,
}: {
  email: string;
  onChangeEmail: () => void;
  onVerified: () => void;
  turnstile: TurnstileState;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [resendAt, setResendAt] = useState(() => Date.now() + OTP_POLICY.resendCooldownSeconds * 1000);
  const resendIn = useCountdown(resendAt);
  const inputRef = useRef<HTMLInputElement>(null);
  const verify = useVerifyCode();
  const request = useRequestCode();

  useEffect(() => inputRef.current?.focus(), []);

  const submit = (value: string) => {
    if (verify.isPending) return;
    setError(undefined);
    verify.mutate(
      { email, code: value },
      {
        onSuccess: () => {
          toast.success('Email verified');
          onVerified();
        },
        onError: (err) => {
          setCode('');
          inputRef.current?.focus();
          if (
            err instanceof ApiRequestError &&
            ['OTP_INCORRECT', 'OTP_INVALID', 'OTP_LOCKED'].includes(err.code)
          ) {
            setError(err.message);
          } else {
            toast.error(errorMessage(err));
          }
        },
      },
    );
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length === OTP_POLICY.length) submit(code);
    else setError(`Enter all ${OTP_POLICY.length} digits.`);
  };

  const resend = () => {
    request.mutate(
      { email, captchaToken: turnstile.token ?? undefined },
      {
        onSettled: turnstile.reset,
        onSuccess: (data) => {
          setResendAt(Date.now() + data.resendInSeconds * 1000);
          setCode('');
          setError(undefined);
          toast.success('New code sent');
          inputRef.current?.focus();
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <p className="text-sm text-muted">
        Enter the code we sent to <span className="font-medium text-fg">{email}</span>.{' '}
        <button type="button" onClick={onChangeEmail} className="rounded-sm text-accent-fg hover:underline">
          Change
        </button>
      </p>

      <div className="mt-5">
        <CodeInput
          inputRef={inputRef}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError(undefined);
          }}
          onComplete={submit}
          busy={verify.isPending}
          invalid={Boolean(error)}
          describedBy={error ? 'code-error' : 'code-hint'}
        />
        {error ? (
          <p id="code-error" role="alert" className="mt-2 text-[13px] text-danger">
            {error}
          </p>
        ) : (
          <p id="code-hint" className="mt-2 text-[13px] text-muted">
            The code expires in {OTP_POLICY.ttlSeconds / 60} minutes. Check your spam folder if it hasn’t
            arrived.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={verify.isPending}>
          {verify.isPending && <Spinner />}
          Verify
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={resend}
          disabled={resendIn > 0 || request.isPending || (turnstile.enabled && !turnstile.token)}
        >
          {request.isPending && <Spinner />}
          {resendIn > 0 ? `Resend in ${formatSeconds(resendIn)}` : 'Resend code'}
        </Button>
      </div>
    </form>
  );
}

function SignedIn({ email }: { email: string }) {
  const signOut = useSignOut();
  return (
    <div className="flex max-w-md items-start gap-3 rounded-xl border border-line bg-elevated/60 p-4">
      <span
        aria-hidden
        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-ok-soft text-ok"
      >
        <CheckIcon width={14} height={14} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">Email verified</p>
        <p className="truncate text-sm text-muted">{email}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => signOut.mutate(undefined, { onError: (err) => toast.error(errorMessage(err)) })}
        disabled={signOut.isPending}
      >
        Use a different email
      </Button>
    </div>
  );
}
