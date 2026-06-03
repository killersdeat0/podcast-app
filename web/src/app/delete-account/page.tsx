import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Delete Account — Syncpods',
  description: 'How to delete your Syncpods account and what happens to your data.',
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

function Ul({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc list-inside space-y-1 text-on-surface-variant leading-relaxed pl-1">
      {children}
    </ul>
  )
}

export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-surface">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-on-surface mb-2">Delete Your Account</h1>
        <p className="text-sm text-on-surface-dim mb-12">
          Syncpods · Developed by Trilium
        </p>

        <div className="space-y-12">

          <Section title="How to Delete Your Account">
            <P>You can delete your Syncpods account in two ways:</P>
            <div className="space-y-4">
              <div className="bg-surface-container rounded-xl p-5">
                <h3 className="text-base font-semibold text-on-surface mb-2">Option 1 — In the app</h3>
                <ol className="list-decimal list-inside space-y-1 text-on-surface-variant leading-relaxed pl-1">
                  <li>Open Syncpods on your device</li>
                  <li>Go to <strong className="text-on-surface">Settings</strong></li>
                  <li>Scroll to the <strong className="text-on-surface">Account</strong> section</li>
                  <li>Tap <strong className="text-on-surface">Delete Account</strong> and confirm</li>
                </ol>
                <p className="text-sm text-on-surface-variant mt-3">
                  Your account and all associated data will be permanently deleted immediately.
                </p>
              </div>
              <div className="bg-surface-container rounded-xl p-5">
                <h3 className="text-base font-semibold text-on-surface mb-2">Option 2 — Email us</h3>
                <P>
                  Send a deletion request to{' '}
                  <a href="mailto:support@syncpods.app" className="text-primary hover:underline">
                    support@syncpods.app
                  </a>{' '}
                  from the email address associated with your account. We will process your request within 30 days.
                </P>
              </div>
            </div>
          </Section>

          <Section title="What Gets Deleted">
            <P>
              When your account is deleted, the following data is permanently and immediately removed
              from our systems:
            </P>
            <Ul>
              <li>Your account credentials and profile</li>
              <li>Podcast subscriptions</li>
              <li>Listening history and playback progress</li>
              <li>Episode queue</li>
              <li>Playlists and playlist episodes</li>
              <li>Bookmarks</li>
              <li>Playback preferences (speed, volume, skip intervals)</li>
              <li>App preferences (theme, language)</li>
            </Ul>
          </Section>

          <Section title="What Is Retained">
            <P>
              Stripe, our payment processor, retains transaction and billing records independently
              per their legal obligations and{' '}
              <a
                href="https://stripe.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                privacy policy
              </a>
              . We do not retain any other data after deletion.
            </P>
            <P>
              If you have an active paid subscription, it will be cancelled at the end of the
              current billing period when you delete your account.
            </P>
          </Section>

          <Section title="Contact">
            <P>
              Questions about your data or this process? Contact us at{' '}
              <a href="mailto:support@syncpods.app" className="text-primary hover:underline">
                support@syncpods.app
              </a>
              .
            </P>
          </Section>

        </div>
      </div>
    </main>
  )
}
