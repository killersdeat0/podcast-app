'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useStrings } from '@/lib/i18n/LocaleContext'

const MONTHLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID ?? ''
const YEARLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID ?? ''

export default function UpgradePage() {
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
      <h1 className="text-3xl font-bold text-white mb-2">{s.upgrade.heading}</h1>

      {tier !== null && (
        <p className="text-sm mb-8 text-gray-400">
          {tier === 'paid' ? s.upgrade.paid_tier_status : s.upgrade.free_tier_status}
        </p>
      )}

      {message && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-violet-900/40 border border-violet-700 text-violet-200 text-sm">
          {message}
        </div>
      )}

      {tier === 'free' && (
        <>
          <p className="text-gray-400 mb-8">
            {s.upgrade.benefits_description}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Monthly */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">{s.upgrade.monthly_label}</h2>
                <p className="text-3xl font-bold text-white mt-1">
                  $4.99 <span className="text-base font-normal text-gray-400">{s.upgrade.monthly_price_suffix}</span>
                </p>
              </div>
              <ul className="text-sm text-gray-400 space-y-1 flex-1">
                <li>{s.upgrade.feature_unlimited_queue}</li>
                <li>{s.upgrade.feature_all_speeds}</li>
                <li>{s.upgrade.feature_full_history}</li>
                <li>{s.upgrade.feature_no_ads}</li>
              </ul>
              <button
                onClick={() => handleSubscribe(MONTHLY_PRICE_ID, 'monthly')}
                disabled={loading !== null}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {loading === 'monthly' ? s.upgrade.redirecting : s.upgrade.subscribe_monthly}
              </button>
            </div>

            {/* Annual */}
            <div className="bg-gray-900 border border-violet-600 rounded-xl p-6 flex flex-col gap-4 relative">
              <div className="absolute -top-3 left-4">
                <span className="bg-violet-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  {s.upgrade.annual_savings_badge}
                </span>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">{s.upgrade.annual_label}</h2>
                <p className="text-3xl font-bold text-white mt-1">
                  $50 <span className="text-base font-normal text-gray-400">{s.upgrade.annual_price_suffix}</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{s.upgrade.annual_monthly_equiv}</p>
              </div>
              <ul className="text-sm text-gray-400 space-y-1 flex-1">
                <li>{s.upgrade.feature_unlimited_queue}</li>
                <li>{s.upgrade.feature_all_speeds}</li>
                <li>{s.upgrade.feature_full_history}</li>
                <li>{s.upgrade.feature_no_ads}</li>
              </ul>
              <button
                onClick={() => handleSubscribe(YEARLY_PRICE_ID, 'yearly')}
                disabled={loading !== null}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
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
          }}
          disabled={upgrading}
          className="mt-6 text-xs text-green-400 underline disabled:opacity-50"
        >
          {upgrading ? '...' : s.upgrade.dev_upgrade}
        </button>
      )}

      {tier === 'paid' && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 text-gray-300 text-sm">
          {s.upgrade.paid_management}{' '}
          <a
            href="https://billing.stripe.com/p/login"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 underline"
          >
            {s.upgrade.stripe_portal_link}
          </a>
          .
        </div>
      )}
    </div>
  )
}
