'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useStrings } from '@/lib/i18n/LocaleContext'

const MONTHLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID ?? ''
const YEARLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID ?? ''

export default function UpgradePage() {
  const router = useRouter()
  const [tier, setTier] = useState<'free' | 'paid' | null>(null)
  const [loading, setLoading] = useState<'monthly' | 'yearly' | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const s = useStrings()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      setMessage(s.upgrade.payment_success)
    } else if (params.get('cancelled') === 'true') {
      setMessage(s.upgrade.checkout_cancelled)
    }

    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('user_profiles')
        .select('tier')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          setTier(data?.tier === 'paid' ? 'paid' : 'free')
        })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubscribe(priceId: string, plan: 'monthly' | 'yearly') {
    setLoading(plan)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error ?? s.upgrade.error_generic)
        return
      }
      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setMessage(s.upgrade.error_network)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-on-surface mb-2">{s.upgrade.heading}</h1>

      {tier !== null && (
        <p className="text-sm mb-8 text-on-surface-variant">
          {tier === 'paid' ? s.upgrade.paid_tier_status : s.upgrade.free_tier_status}
        </p>
      )}

      {message && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-primary-container/40 border border-primary text-on-primary-container text-sm">
          {message}
        </div>
      )}

      {tier === 'free' && (
        <>
          <p className="text-on-surface-variant mb-8">
            {s.upgrade.benefits_description}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Monthly */}
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6 flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-semibold text-on-surface">{s.upgrade.monthly_label}</h2>
                <p className="text-3xl font-bold text-on-surface mt-1">
                  $4.99 <span className="text-base font-normal text-on-surface-variant">{s.upgrade.monthly_price_suffix}</span>
                </p>
              </div>
              <ul className="text-sm text-on-surface-variant space-y-1 flex-1">
                <li>{s.upgrade.feature_unlimited_queue}</li>
                <li>{s.upgrade.feature_all_speeds}</li>
                <li>{s.upgrade.feature_full_history}</li>
                <li>{s.upgrade.feature_no_ads}</li>
              </ul>
              <button
                onClick={() => handleSubscribe(MONTHLY_PRICE_ID, 'monthly')}
                disabled={loading !== null}
                className="w-full bg-brand hover:bg-brand disabled:opacity-50 disabled:cursor-not-allowed text-on-brand font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {loading === 'monthly' ? s.upgrade.redirecting : s.upgrade.subscribe_monthly}
              </button>
            </div>

            {/* Annual */}
            <div className="bg-surface-container-low border border-primary rounded-xl p-6 flex flex-col gap-4 relative">
              <div className="absolute -top-3 left-4">
                <span className="bg-brand text-on-brand text-xs font-semibold px-3 py-1 rounded-full">
                  {s.upgrade.annual_savings_badge}
                </span>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-on-surface">{s.upgrade.annual_label}</h2>
                <p className="text-3xl font-bold text-on-surface mt-1">
                  $50 <span className="text-base font-normal text-on-surface-variant">{s.upgrade.annual_price_suffix}</span>
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">{s.upgrade.annual_monthly_equiv}</p>
              </div>
              <ul className="text-sm text-on-surface-variant space-y-1 flex-1">
                <li>{s.upgrade.feature_unlimited_queue}</li>
                <li>{s.upgrade.feature_all_speeds}</li>
                <li>{s.upgrade.feature_full_history}</li>
                <li>{s.upgrade.feature_no_ads}</li>
              </ul>
              <button
                onClick={() => handleSubscribe(YEARLY_PRICE_ID, 'yearly')}
                disabled={loading !== null}
                className="w-full bg-brand hover:bg-brand disabled:opacity-50 disabled:cursor-not-allowed text-on-brand font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {loading === 'yearly' ? s.upgrade.redirecting : s.upgrade.subscribe_annually}
              </button>
            </div>
          </div>
        </>
      )}

      {process.env.NODE_ENV === 'development' && tier === 'free' && (
        <button
          onClick={async () => {
            setUpgrading(true)
            await fetch('/api/dev/upgrade', { method: 'POST' })
            setTier('paid')
            setUpgrading(false)
            router.refresh()
          }}
          disabled={upgrading}
          className="mt-6 text-xs text-playback-indicator underline disabled:opacity-50"
        >
          {upgrading ? '...' : s.upgrade.dev_upgrade}
        </button>
      )}

      {tier === 'paid' && (
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6 text-on-surface text-sm">
          {s.upgrade.paid_management}{' '}
          <a
            href="https://billing.stripe.com/p/login"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary underline"
          >
            {s.upgrade.stripe_portal_link}
          </a>
          .
        </div>
      )}
    </div>
  )
}
