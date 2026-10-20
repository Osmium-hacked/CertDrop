import { m } from 'framer-motion';
import { Wizard } from '../features/wizard/Wizard';

export function HomePage() {
  return (
    <>
      <section className="relative pt-20 pb-14 text-center sm:pt-28 sm:pb-16">
        <div
          aria-hidden
          className="hero-glow pointer-events-none absolute inset-x-[-40%] -top-14 h-[520px]"
        />
        <m.div
          className="relative"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="text-gradient mx-auto max-w-3xl text-[2.5rem] leading-[1.05] font-semibold tracking-[var(--tracking-heading)] sm:text-6xl">
            Certificates for everyone, verified and delivered.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted sm:text-lg">
            Upload a CSV and a template. Every participant gets a verified certificate in their inbox.
          </p>
        </m.div>
      </section>

      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <Wizard />
      </m.div>
    </>
  );
}
