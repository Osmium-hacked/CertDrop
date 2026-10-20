import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ArrowLeftIcon } from '../../components/ui/icons';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { Skeleton } from '../../components/ui/Skeleton';
import { VerifyEmailStep } from '../auth/VerifyEmailStep';
import { BatchDraftProvider } from '../batch/BatchDraftProvider';
import { Stepper } from './Stepper';
import { STEPS } from './steps';
import { useStepStatus } from './useStepStatus';

/** Elements where Enter already means something, so it must not also advance the wizard. */
const ENTER_OWNERS = 'input, textarea, button, a, select, [contenteditable="true"]';

// Later steps load on demand: the editor pulls in Konva (and pdf.js for PDFs), the participant
// step Papa Parse. Someone who only verifies their email downloads neither.
const TemplateStep = lazy(() => import('../template/TemplateStep'));
const ParticipantsStep = lazy(() => import('../participants/ParticipantsStep'));

export function Wizard() {
  return (
    <BatchDraftProvider>
      <WizardFlow />
    </BatchDraftProvider>
  );
}

function WizardFlow() {
  const status = useStepStatus();

  const [selected, setSelected] = useState(0);
  const [reached, setReached] = useState(0);
  // A step is reachable only if every step before it is complete. Deriving this (rather than
  // storing it) means signing out, an expired session or replacing the CSV with a broken one
  // pulls the organizer back to the first step that needs attention.
  const firstIncomplete = STEPS.findIndex((s) => !status[s.id].complete);
  const furthest = Math.min(reached, firstIncomplete === -1 ? STEPS.length - 1 : firstIncomplete);
  const current = Math.min(selected, furthest);

  const step = STEPS[current] ?? STEPS[0]!;
  const isLast = current === STEPS.length - 1;
  const canContinue = !isLast && status[step.id].complete;
  const hint = status[step.id].hint;

  const goTo = useCallback(
    (index: number) => {
      if (index >= 0 && index <= furthest) setSelected(index);
    },
    [furthest],
  );

  /** Moves forward unconditionally; used by steps that know they just completed. */
  const advance = useCallback(() => {
    const target = Math.min(current + 1, STEPS.length - 1);
    setReached((r) => Math.max(r, target));
    setSelected(target);
  }, [current]);

  const next = useCallback(() => {
    if (canContinue) advance();
  }, [canContinue, advance]);

  // Listen on window rather than the card: after a click on plain text, focus sits on <body>,
  // and Enter should still advance. Steps with inputs submit their own forms on Enter.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing || e.defaultPrevented) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.target instanceof Element && e.target.closest(ENTER_OWNERS)) return;
      e.preventDefault();
      next();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [next]);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_0_0_1px_rgb(0_0_0/0.4),0_24px_80px_-24px_rgb(0_0_0/0.8)]">
      {/* App-window title bar */}
      <div className="flex items-center justify-between gap-4 border-b border-line bg-white/[0.015] px-4 py-3 sm:px-5">
        <Stepper steps={STEPS} current={current} furthest={furthest} onSelect={goTo} />
        <span className="hidden shrink-0 text-xs text-muted tabular-nums md:inline">
          Step {current + 1} of {STEPS.length}
        </span>
      </div>

      <div className="px-4 py-8 sm:px-10 sm:py-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={step.id}
            aria-labelledby={`step-${step.id}-title`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <SectionLabel>
              Step {current + 1} · {step.label}
            </SectionLabel>
            <h2
              id={`step-${step.id}-title`}
              className="mt-2 text-xl font-semibold tracking-[var(--tracking-heading)] sm:text-2xl"
            >
              {step.title}
            </h2>
            <p className="mt-1.5 max-w-xl text-sm text-muted">{step.description}</p>

            <div className="mt-8">
              {step.id === 'verify' ? (
                <VerifyEmailStep onVerified={advance} />
              ) : step.id === 'template' ? (
                <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
                  <TemplateStep />
                </Suspense>
              ) : step.id === 'participants' ? (
                <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
                  <ParticipantsStep />
                </Suspense>
              ) : (
                <EmptyState
                  icon={step.icon}
                  title="This step is being built"
                  description="The layout, navigation and keyboard handling are in place. The step’s controls arrive in an upcoming milestone."
                />
              )}
            </div>
          </motion.section>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-3 sm:px-5">
        <Button variant="ghost" size="sm" onClick={() => goTo(current - 1)} disabled={current === 0}>
          <ArrowLeftIcon />
          Back
        </Button>
        <div className="flex items-center gap-3">
          {canContinue ? (
            <span className="hidden text-xs text-muted sm:inline">
              Press <kbd className="rounded border border-line-strong px-1 font-sans text-[11px]">Enter</kbd>{' '}
              to continue
            </span>
          ) : (
            hint && (
              <span className="text-right text-xs text-muted" aria-live="polite">
                {hint}
              </span>
            )
          )}
          <Button variant="primary" size="sm" onClick={next} disabled={!canContinue}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
