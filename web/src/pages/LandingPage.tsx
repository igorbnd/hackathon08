import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

// ─── Small presentational helpers ────────────────────────────────────────────

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow && (
        <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
        {title}
      </h2>
      {subtitle && <p className="mt-4 text-lg text-gray-600">{subtitle}</p>}
    </div>
  );
}

function FeatureCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">{children}</p>
    </div>
  );
}

function StepCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <span
        className="absolute -top-3 left-6 inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white"
        aria-hidden="true"
      >
        {step}
      </span>
      <h3 className="mt-2 text-base font-semibold text-gray-900">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-gray-600">{children}</div>
    </li>
  );
}

// ─── Landing Page ────────────────────────────────────────────────────────────

export function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <span className="text-xl font-bold tracking-tight text-indigo-600">
            InvoiceIQ
          </span>
          <nav className="flex items-center gap-3" aria-label="Account">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-md px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Create Account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50 via-white to-white">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-indigo-500"
                  aria-hidden="true"
                />
                Beta prototype &middot; Built for the Kiro coding hackathon
              </span>

              <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-6xl">
                Know what to do with{' '}
                <span className="text-indigo-600">every invoice</span>
              </h1>

              <p className="mt-6 text-lg leading-relaxed text-gray-600 sm:text-xl">
                InvoiceIQ turns the pile of bills, invoices and subscription charges in
                your life into a single searchable, normalised record &mdash; then tells
                you what to actually do about each one, with evidence.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  to={isAuthenticated ? '/dashboard' : '/signup'}
                  className="w-full rounded-md bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
                >
                  {isAuthenticated ? 'Open Dashboard' : 'Try the Beta'}
                </Link>
                <a
                  href="#how-it-works"
                  className="w-full rounded-md border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-auto"
                >
                  See how it works
                </a>
              </div>

              <p className="mt-6 text-sm text-gray-500">
                Free to try &middot; Synthetic demo data included &middot; No payment
                details required
              </p>
            </div>
          </div>
        </section>

        {/* ── The problem ─────────────────────────────────────────────────── */}
        <section className="border-t border-gray-100 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="The problem"
              title="An invoice arrives. Now what?"
              subtitle="Most people just pay it. That is where the money leaks."
            />

            <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2">
              {[
                'Is this charge even legitimate, or is it a lookalike?',
                'Did I already pay this one last month?',
                'Has the price gone up since the last bill — and was I told?',
                'Am I still using this service at all?',
                'Is this a duplicate with a different reference number?',
                'Should I just pay, or should I challenge it?',
              ].map((q) => (
                <div
                  key={q}
                  className="flex items-start gap-3 rounded-lg bg-gray-50 p-4"
                >
                  <span
                    className="mt-0.5 select-none text-lg font-bold leading-none text-indigo-400"
                    aria-hidden="true"
                  >
                    ?
                  </span>
                  <p className="text-sm text-gray-700">{q}</p>
                </div>
              ))}
            </div>

            <p className="mx-auto mt-10 max-w-2xl text-center text-base text-gray-600">
              Invoices arrive from dozens of unrelated companies in dozens of formats
              &mdash; PDFs, phone photos, portal screenshots. There is no single view, so
              price rises, duplicates and forgotten subscriptions go unnoticed for years.
            </p>
          </div>
        </section>

        {/* ── How it works ────────────────────────────────────────────────── */}
        <section id="how-it-works" className="bg-gray-50 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="How it works"
              title="Upload anything. Get a normalised record."
              subtitle="The normalisation step is the whole point — it is what makes cross-vendor comparison possible."
            />

            <ol className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <StepCard step={1} title="Upload">
                Drop in a PDF, scan or phone photo. The file is uploaded straight to
                encrypted storage under your own private prefix.
              </StepCard>
              <StepCard step={2} title="Extract">
                An AI vision model reads the document and pulls out vendor, dates,
                totals, tax and every line item.
              </StepCard>
              <StepCard step={3} title="Normalise">
                Whatever the source format, the result is stored as one canonical JSON
                invoice record with a consistent shape.
              </StepCard>
              <StepCard step={4} title="Analyse">
                The new invoice is compared against your full history for that vendor,
                producing a recommendation backed by cited evidence.
              </StepCard>
            </ol>
          </div>
        </section>

        {/* ── Features ────────────────────────────────────────────────────── */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading eyebrow="Capabilities" title="What InvoiceIQ looks for" />

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <FeatureCard title="Silent price rises">
                Detects when a subscription or tariff increases — especially just after a
                minimum contract term ends, and no notice was given.
              </FeatureCard>
              <FeatureCard title="Duplicate invoices">
                Flags the same charge billed twice, even when the vendor used a different
                reference number.
              </FeatureCard>
              <FeatureCard title="Overlapping subscriptions">
                Spots two active licences covering the same period, and estimates the
                annualised waste.
              </FeatureCard>
              <FeatureCard title="Anomalous readings">
                Highlights utility bills that sit far above your rolling 12-month mean,
                such as an inflated estimated meter reading.
              </FeatureCard>
              <FeatureCard title="Unfamiliar line items">
                Surfaces charges that have never appeared on any previous invoice from
                that vendor.
              </FeatureCard>
              <FeatureCard title="Natural-language search">
                Ask questions in plain English. Answers are compiled into real queries
                over your records — never invented.
              </FeatureCard>
            </div>

            <div className="mt-12 rounded-xl border border-gray-200 bg-gradient-to-br from-indigo-50 to-white p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                Every invoice gets one clear verdict
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  'PAY',
                  'PAY BUT VERIFY',
                  'HOLD',
                  'QUERY THE VENDOR',
                  'DISPUTE',
                  'LIKELY DUPLICATE',
                  'CANCEL OR DOWNGRADE',
                ].map((verdict) => (
                  <span
                    key={verdict}
                    className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700"
                  >
                    {verdict}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-sm text-gray-600">
                Each verdict carries plain-English reasoning, the specific prior invoices
                that drove it, a confidence level and a suggested next step.
              </p>
            </div>
          </div>
        </section>

        {/* ── Quick tutorial ─────────────────────────────────────────────── */}
        <section className="bg-gray-50 py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Beta quick start"
              title="Five minutes, end to end"
              subtitle="A new account starts empty. Follow these steps to see the full pipeline."
            />

            <ol className="mt-12 space-y-4">
              {[
                {
                  title: 'Create an account',
                  body: 'Sign up with an email address and a password of at least 8 characters, including upper and lower case letters and a number. Accounts are confirmed automatically in the beta, so you can sign in immediately.',
                },
                {
                  title: 'Upload your first document',
                  body: 'Go to Upload and drag in a PDF, PNG or JPEG up to 5 MB. Watch the status move through queued, extracting, normalising, analysing and finally ready. A single-page invoice usually completes in under 20 seconds.',
                },
                {
                  title: 'Open the invoice',
                  body: 'From the Dashboard, click the invoice. You will see the extracted line items, the canonical fields, and — generated on demand — the AI recommendation with its evidence and a comparison against earlier invoices from the same vendor.',
                },
                {
                  title: 'Upload a second invoice from the same vendor',
                  body: 'This is the important step. Comparison needs history. With two or more invoices from one vendor, InvoiceIQ can start detecting price movements, duplicates and cadence changes.',
                },
                {
                  title: 'Try search and subscriptions',
                  body: 'Ask something in plain English on the Search page, such as "show me everything from Nexwave". Then open Subscriptions to see recurring charges grouped by vendor with annualised cost estimates.',
                },
                {
                  title: 'Correct and tidy up',
                  body: 'Mark an invoice as paid, or delete it entirely, from the invoice detail page. Deleting removes both the stored document and the record.',
                },
              ].map((s, i) => (
                <li
                  key={s.title}
                  className="flex gap-4 rounded-xl border border-gray-200 bg-white p-5"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{s.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-900">
                <span className="font-semibold">Tip:</span> recommendations get
                substantially better with history. A single invoice in isolation has
                nothing to be compared against, so expect a cautious verdict until you
                have a few from the same vendor.
              </p>
            </div>
          </div>
        </section>

        {/* ── Built with Kiro ────────────────────────────────────────────── */}
        <section className="py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="How this was built"
              title="Built for the Kiro coding hackathon"
              subtitle="Spec-driven development, with Kiro involved at every stage."
            />

            <div className="mt-12 space-y-6 text-base leading-relaxed text-gray-700">
              <p>
                InvoiceIQ was created as a hackathon entry and developed with deep
                assistance from <span className="font-semibold">Kiro</span>, an AI
                development environment. The approach was deliberately
                specification-first rather than improvised.
              </p>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Steering files
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Product scope, technology choices, repository structure and hackathon
                    constraints were locked in writing before any code existed.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-900">Specs</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Each area moved through a requirements, design and tasks cycle, so
                    implementation became a matter of executing an agreed plan.
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Human review
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    AI output still needed correcting — model identifiers, cloud
                    networking patterns, request signing and event formats all required
                    hands-on debugging.
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-600">
                The full audit trail, including the steering files and specs, is public in
                the project repository.
              </p>

              <div>
                <a
                  href="https://github.com/igorbnd/hackathon08"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  View the source on GitHub
                  <span aria-hidden="true">&rarr;</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── Limitations ────────────────────────────────────────────────── */}
        <section className="bg-gray-50 py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Be aware"
              title="Beta limitations"
              subtitle="This is an honest list. Please read it before relying on anything here."
            />

            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {[
                {
                  t: 'AI extraction can be wrong',
                  d: 'Fields are read by a vision model. Poor scans, unusual layouts and handwriting all reduce accuracy. Always check extracted values against the original document.',
                },
                {
                  t: 'Recommendations are advisory only',
                  d: 'Verdicts are produced by pattern analysis over your uploaded history. They can be incomplete or simply incorrect, and they do not know your contracts or circumstances.',
                },
                {
                  t: 'File size and format limits',
                  d: 'Uploads are capped at 5 MB per document, and PDF, PNG and JPEG are supported. Very long multi-page documents may time out during processing.',
                },
                {
                  t: 'Processing is synchronous',
                  d: 'The extraction pipeline runs inside a single request rather than a durable workflow, so an unusually slow document can fail rather than retry cleanly.',
                },
                {
                  t: 'Rate limits apply',
                  d: 'AI capacity is shared and rate limited. During busy periods extraction or recommendations may fail and need retrying.',
                },
                {
                  t: 'Prototype-grade security',
                  d: 'Authentication and session handling are simplified for demonstration. Email addresses are not verified, and tokens are held in browser storage.',
                },
                {
                  t: 'Single region, no availability target',
                  d: 'The service runs in one cloud region with no uptime commitment. It may be taken offline, reset or wiped without notice.',
                },
                {
                  t: 'No backups or export guarantees',
                  d: 'Do not treat InvoiceIQ as a system of record. Keep your own copies of anything that matters.',
                },
              ].map((l) => (
                <div
                  key={l.t}
                  className="rounded-xl border border-gray-200 bg-white p-5"
                >
                  <h3 className="text-sm font-semibold text-gray-900">{l.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{l.d}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                Deliberately out of scope
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                InvoiceIQ does not connect to your bank, does not make or schedule
                payments, is not an accounting ledger, does not support shared or
                multi-organisation accounts, and has no mobile app. It reads documents you
                give it and offers an opinion — nothing more.
              </p>
            </div>
          </div>
        </section>

        {/* ── Important notice ───────────────────────────────────────────── */}
        <section className="py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-8">
              <h2 className="text-2xl font-bold tracking-tight text-red-900">
                Important notice — please read
              </h2>

              <div className="mt-6 space-y-5 text-sm leading-relaxed text-red-900">
                <div>
                  <h3 className="font-semibold">
                    Do not upload personal or commercially sensitive information
                  </h3>
                  <p className="mt-1">
                    This is an experimental prototype, not a hardened production service.
                    Please do not upload documents containing personal data about
                    yourself or others, confidential business information, banking
                    details, payment card numbers, government identifiers, health
                    information, or anything covered by a confidentiality obligation. Use
                    synthetic, redacted or otherwise non-sensitive documents.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold">Not a commercial release</h3>
                  <p className="mt-1">
                    InvoiceIQ is a demonstration prototype built for a hackathon. It is
                    not a commercial product, it is not supported, and it carries no
                    service level agreement, uptime guarantee or maintenance commitment.
                    Features may change or disappear, and data may be deleted at any time
                    without notice.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold">Not professional advice</h3>
                  <p className="mt-1">
                    Recommendations are informational only. They are not legal, tax,
                    accounting or financial advice. Do not withhold a payment, dispute a
                    charge, cancel a contract or take any other consequential action
                    solely because of output from this tool. Verify against the original
                    documents and consult a suitably qualified professional.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold">No warranty and no liability</h3>
                  <p className="mt-1">
                    The software is provided &ldquo;as is&rdquo;, without warranty of any
                    kind, express or implied. To the fullest extent permitted by
                    applicable law, the authors and contributors accept no liability for
                    any loss or damage arising from use of this prototype, including
                    financial loss, missed payments, incorrect analysis, data loss or
                    business interruption. You use it entirely at your own risk.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold">Your responsibility</h3>
                  <p className="mt-1">
                    You are responsible for ensuring you have the right to upload any
                    document you submit, and for complying with any laws or obligations
                    that apply to you. Documents you upload are processed by third-party
                    AI services in order to extract and analyse their contents.
                  </p>
                </div>
              </div>

              <p className="mt-6 border-t border-red-200 pt-4 text-xs text-red-800">
                This notice is a plain-English summary for a prototype and is not legal
                advice or a substitute for formal terms of service. Licensing terms are in
                the project repository.
              </p>
            </div>
          </div>
        </section>

        {/* ── Final CTA ──────────────────────────────────────────────────── */}
        <section className="border-t border-gray-100 bg-gradient-to-b from-white to-indigo-50 py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              Have a look around
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Create an account with a throwaway email and try it with a synthetic
              invoice. Nothing here is billed.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to={isAuthenticated ? '/dashboard' : '/signup'}
                className="w-full rounded-md bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
              >
                {isAuthenticated ? 'Open Dashboard' : 'Create Account'}
              </Link>
              {!isAuthenticated && (
                <Link
                  to="/login"
                  className="w-full rounded-md border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-auto"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="text-center sm:text-left">
              <p className="text-base font-bold text-indigo-600">InvoiceIQ</p>
              <p className="mt-1 text-xs text-gray-500">
                Beta prototype &middot; Built with Kiro for the Kiro coding hackathon
              </p>
            </div>
            <nav
              className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm"
              aria-label="Footer"
            >
              <a
                href="https://github.com/igorbnd/hackathon08"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
              >
                GitHub
              </a>
              <a
                href="https://github.com/igorbnd/hackathon08/blob/main/README.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
              >
                Documentation
              </a>
              <a
                href="https://github.com/igorbnd/hackathon08/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
              >
                Licence (MIT)
              </a>
            </nav>
          </div>

          <p className="mt-8 border-t border-gray-100 pt-6 text-center text-xs leading-relaxed text-gray-500">
            Provided as-is with no warranty and no liability. Not a commercial release.
            Recommendations are informational only and are not legal, tax or financial
            advice. Do not upload personal or commercially sensitive documents.
          </p>
        </div>
      </footer>
    </div>
  );
}
