import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Privacy Policy — Syncpods',
  description: 'Privacy Policy for the Syncpods podcast app by Trilium.',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-on-surface mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-on-surface-variant leading-relaxed">{children}</p>
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-on-surface mb-2">{title}</h3>
      {children}
    </div>
  )
}

function Ul({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc list-inside space-y-1 text-on-surface-variant leading-relaxed pl-1">
      {children}
    </ul>
  )
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-container">
            {head.map((h) => (
              <th key={h} scope="col" className="text-left px-4 py-3 text-on-surface font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-outline-variant">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-on-surface-variant">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-surface">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-on-surface mb-2">Privacy Policy</h1>
        <p className="text-sm text-on-surface-dim mb-12">
          Effective Date: May 20, 2026 · Last Updated: May 20, 2026
        </p>

        <div className="space-y-12">

          <Section title="1. Introduction">
            <P>
              Trilium (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the Syncpods mobile application (the
              &quot;App&quot;). This Privacy Policy explains how we collect, use, disclose, and safeguard
              your personal information when you use Syncpods on Android or iOS.
            </P>
            <P>
              By using the App, you agree to the collection and use of information described in
              this policy. If you do not agree, please do not use the App.
            </P>
          </Section>

          <Section title="2. Data Controller">
            <P>
              <strong className="text-on-surface">Trilium</strong>
              <br />
              Email:{' '}
              <a href="mailto:support@syncpods.app" className="text-primary hover:underline">
                support@syncpods.app
              </a>
              <br />
              Website:{' '}
              <a href="https://syncpods.app" rel="noopener noreferrer" className="text-primary hover:underline">
                https://syncpods.app
              </a>
            </P>
          </Section>

          <Section title="3. Information We Collect">
            <Sub title="3.1 Information You Provide Directly">
              <Ul>
                <li><strong className="text-on-surface">Account credentials:</strong> Email address and password, or OAuth profile data (name, email, profile picture) when you sign in with Google.</li>
                <li><strong className="text-on-surface">Bookmarks:</strong> Notes you attach to saved moments within episodes.</li>
                <li><strong className="text-on-surface">Playlist content:</strong> Names and descriptions you create for playlists.</li>
              </Ul>
            </Sub>
            <Sub title="3.2 Information We Collect Automatically">
              <Ul>
                <li><strong className="text-on-surface">Listening activity:</strong> Episode playback position, completion status, total seconds listened per day, and total listening time per podcast.</li>
                <li><strong className="text-on-surface">Subscriptions:</strong> Podcasts you follow, including feed URLs, episode filter preferences, and per-podcast playback speed (paid tier).</li>
                <li><strong className="text-on-surface">Queue and history:</strong> Episodes you add to your queue or have previously played.</li>
                <li><strong className="text-on-surface">Playlists:</strong> Episodes you organize into playlists and their order.</li>
                <li><strong className="text-on-surface">Playback preferences:</strong> Volume, skip durations, and playback speed.</li>
                <li><strong className="text-on-surface">App preferences:</strong> Selected theme and UI settings.</li>
                <li><strong className="text-on-surface">Billing status:</strong> Subscription tier (free or paid), and Stripe customer and subscription IDs.</li>
              </Ul>
            </Sub>
            <Sub title="3.3 Information We Do Not Collect">
              <P>
                We do not collect device identifiers, IMEI, precise location, contacts, or
                microphone/camera data. Payment card details are handled exclusively by Stripe
                and are never stored on our systems.
              </P>
            </Sub>
          </Section>

          <Section title="4. How We Use Your Information">
            <P>We use your information to:</P>
            <Ul>
              <li><strong className="text-on-surface">Operate the App:</strong> Authenticate your account, sync your queue, history, and preferences across devices, and enable podcast playback.</li>
              <li><strong className="text-on-surface">Process payments:</strong> Manage your subscription through Stripe and the platform&apos;s native billing (Google Play / Apple StoreKit).</li>
              <li><strong className="text-on-surface">Communicate with you:</strong> Send transactional emails (password reset, email confirmation).</li>
              <li><strong className="text-on-surface">Improve the App:</strong> Analyze aggregate listening patterns to improve recommendations and performance.</li>
              <li><strong className="text-on-surface">Comply with legal obligations:</strong> Retain records as required by applicable law.</li>
            </Ul>
          </Section>

          <Section title="5. Legal Basis for Processing (GDPR)">
            <P>For users in the EEA, UK, and Switzerland:</P>
            <Table
              head={['Purpose', 'Legal Basis']}
              rows={[
                ['Account creation and authentication', 'Performance of a contract (Art. 6(1)(b))'],
                ['Syncing listening history, queue, subscriptions', 'Performance of a contract (Art. 6(1)(b))'],
                ['Processing payments', 'Performance of a contract (Art. 6(1)(b))'],
                ['Security and fraud prevention', 'Legitimate interests (Art. 6(1)(f))'],
                ['Legal compliance', 'Legal obligation (Art. 6(1)(c))'],
              ]}
            />
          </Section>

          <Section title="6. How We Share Your Information">
            <P>
              We do not sell, rent, or trade your personal information. We share data only with
              the following service providers:
            </P>
            <Table
              head={['Service', 'Purpose', 'Data Shared']}
              rows={[
                ['Supabase', 'Database, authentication, and backend', 'All account and usage data'],
                ['Stripe', 'Subscription billing', 'Email address, subscription status'],
                ['Google Play Billing', 'In-app purchases (Android)', 'Purchase confirmation'],
                ['Apple StoreKit', 'In-app purchases (iOS)', 'Purchase confirmation'],
                ['Apple / iTunes API', 'Podcast search and discovery', 'Search queries (not linked to your account)'],
              ]}
            />
            <P>
              We may disclose your information if required by law, court order, or to protect
              the rights and safety of Trilium or its users.
            </P>
          </Section>

          <Section title="7. Data Retention">
            <Table
              head={['Data', 'Retention']}
              rows={[
                ['Account and profile data', 'Until account deletion'],
                ['Listening history and progress', 'Until account deletion'],
                ['Queue, playlists, bookmarks', 'Until account deletion or manual removal'],
                ['Stripe billing records', "Per Stripe's policies and applicable financial law"],
              ]}
            />
            <P>
              When you delete your account, all associated data is permanently deleted from our
              systems. Stripe retains transaction records independently per their legal obligations.
            </P>
          </Section>

          <Section title="8. Data Security">
            <P>We implement industry-standard security measures including:</P>
            <Ul>
              <li>Encrypted data transmission via HTTPS/TLS</li>
              <li>Row-Level Security (RLS) policies ensuring each user can only access their own data</li>
              <li>Authentication and session management via Supabase</li>
            </Ul>
            <P>
              No method of transmission or storage is 100% secure. Contact us at{' '}
              <a href="mailto:support@syncpods.app" className="text-primary hover:underline">
                support@syncpods.app
              </a>{' '}
              immediately if you suspect unauthorized access to your account.
            </P>
          </Section>

          <Section title="9. Your Rights">
            <Sub title="9.1 GDPR Rights (EEA, UK, Switzerland)">
              <P>You have the right to:</P>
              <Ul>
                <li><strong className="text-on-surface">Access:</strong> Request a copy of your personal data.</li>
                <li><strong className="text-on-surface">Rectification:</strong> Request correction of inaccurate data.</li>
                <li><strong className="text-on-surface">Erasure:</strong> Request deletion of your data. You may delete your account directly in the App, which permanently erases all associated data.</li>
                <li><strong className="text-on-surface">Restriction:</strong> Request we restrict processing in certain circumstances.</li>
                <li><strong className="text-on-surface">Portability:</strong> Request your data in a structured, machine-readable format.</li>
                <li><strong className="text-on-surface">Object:</strong> Object to processing based on legitimate interests.</li>
                <li><strong className="text-on-surface">Lodge a complaint:</strong> With your local supervisory authority (e.g., the ICO in the UK).</li>
              </Ul>
            </Sub>
            <Sub title="9.2 CCPA Rights (California Residents)">
              <P>You have the right to:</P>
              <Ul>
                <li><strong className="text-on-surface">Know:</strong> Request disclosure of the personal information we hold about you.</li>
                <li><strong className="text-on-surface">Delete:</strong> Request deletion of your personal information.</li>
                <li><strong className="text-on-surface">Opt out of sale:</strong> We do not sell your personal information — no action is required.</li>
                <li><strong className="text-on-surface">Non-discrimination:</strong> We will not discriminate against you for exercising these rights.</li>
              </Ul>
            </Sub>
            <P>
              To exercise any right, contact us at{' '}
              <a href="mailto:support@syncpods.app" className="text-primary hover:underline">
                support@syncpods.app
              </a>
              . We will respond within 30 days.
            </P>
          </Section>

          <Section title="10. Public Playlists">
            <P>
              You may mark playlists as public. Public playlists — including name, description,
              and episode list — are accessible to anyone with the link. Your account identity
              is not exposed. To make a playlist private, edit it in the App and disable the
              public setting.
            </P>
          </Section>

          <Section title="11. Children's Privacy">
            <P>
              Syncpods is not directed to children under 13 (or 16 in the EEA). We do not
              knowingly collect personal information from children. If you believe a child has
              provided us with personal information, contact us at{' '}
              <a href="mailto:support@syncpods.app" className="text-primary hover:underline">
                support@syncpods.app
              </a>{' '}
              and we will delete it promptly.
            </P>
          </Section>

          <Section title="12. International Data Transfers">
            <P>
              Your data is processed on Supabase infrastructure, which may be located outside
              your country of residence, including in the United States. Supabase maintains
              appropriate data transfer mechanisms (including Standard Contractual Clauses) for
              transfers from the EEA and UK.
            </P>
          </Section>

          <Section title="13. Changes to This Policy">
            <P>
              We may update this Privacy Policy periodically. We will notify you of significant
              changes by updating the &quot;Last Updated&quot; date above. Continued use of the App after
              changes constitutes acceptance of the updated policy.
            </P>
          </Section>

          <Section title="14. Contact Us">
            <P>
              <strong className="text-on-surface">Trilium</strong>
              <br />
              Email:{' '}
              <a href="mailto:support@syncpods.app" className="text-primary hover:underline">
                support@syncpods.app
              </a>
              <br />
              Website:{' '}
              <a href="https://syncpods.app" rel="noopener noreferrer" className="text-primary hover:underline">
                https://syncpods.app
              </a>
            </P>
          </Section>

        </div>
      </div>
    </main>
  )
}
