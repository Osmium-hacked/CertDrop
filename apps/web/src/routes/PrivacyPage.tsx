import { useEffect, type ReactNode } from 'react';
import { SectionLabel } from '../components/ui/SectionLabel';

const CONTACT = 'sales.certdrop@gmail.com';

/** Plain-language privacy policy. Google requires one before the Gmail sending app can be published. */
export function PrivacyPage() {
  useEffect(() => {
    document.title = 'Privacy · CertDrop';
    return () => {
      document.title = 'CertDrop';
    };
  }, []);

  return (
    <article className="mx-auto max-w-2xl pt-20 pb-8 text-[15px] leading-relaxed sm:pt-28">
      <SectionLabel>Privacy</SectionLabel>
      <h1 className="mt-3 text-3xl font-semibold tracking-[var(--tracking-heading)]">Privacy policy</h1>
      <p className="mt-2 text-muted">Last updated 21 October 2026</p>

      <Section title="What CertDrop stores">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Organizers:</strong> the email address you sign in with. Sign-in codes are stored only as
            a one-way hash and deleted within a day.
          </li>
          <li>
            <strong>Participants:</strong> the names and email addresses in the CSV an organizer uploads, used
            to create and email each certificate.
          </li>
          <li>
            <strong>Files:</strong> the certificate design and the generated PDFs. They are deleted 30 days
            after a batch is sent.
          </li>
          <li>
            <strong>Certificate records:</strong> the recipient&rsquo;s name, event, issuer and date, kept so
            that verification links keep working. The public verification page shows the name but never an
            email address, and shows no name once a certificate is revoked.
          </li>
        </ul>
      </Section>

      <Section title="How it is used">
        <p>
          Only to sign organizers in, generate certificates, email them to participants and answer
          verification checks. There are no ads, no analytics or tracking, and nothing is sold or shared
          beyond the services below. The only cookie is a sign-in session cookie for organizers; the human
          check may set its own.
        </p>
      </Section>

      <Section title="Services that process data">
        <p>
          Vercel hosts the website, Render runs the server, Neon stores the database, Cloudflare stores files
          (R2) and runs the human check (Turnstile), and Gmail sends the emails.
        </p>
      </Section>

      <Section title="Google user data">
        <p>
          CertDrop&rsquo;s own Gmail account authorizes it only to send email. It does not read, store or
          share any mailbox content. CertDrop&rsquo;s use of information received from Google APIs adheres to
          the{' '}
          <a
            className="text-accent-fg underline underline-offset-2"
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          To have your data or a certificate record deleted, or for any question, email{' '}
          <a className="text-accent-fg underline underline-offset-2" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          .
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 text-muted [&_strong]:text-fg">{children}</div>
    </section>
  );
}
