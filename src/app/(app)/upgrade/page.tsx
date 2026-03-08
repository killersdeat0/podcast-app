'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const MONTHLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID ?? ''
const YEARLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID ?? ''

export default function UpgradePage() {
  const [tier, setTier] = useState<'free' | 'paid' | null>(null)
  const [loading, setLoading] = useState<'monthly' | 'yearly' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      setMessage('Payment successful! Your account will be upgraded shortly.')
    } else if (params.get('cancelled') === 'true') {
      setMessage('Checkout was cancelled.')
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
  }, [])

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
        setMessage(data.error ?? 'Something went wrong.')
        return
      }
      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setMessage('Network error. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Upgrade to Pro</h1>

      {tier !== null && (
        <p className="text-sm mb-8 text-gray-400">
          {tier === 'paid'
            ? "You're on the paid plan. Thanks for supporting PodSync!"
            : "You're on the free plan."}
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
            Unlock all features: unlimited queue, full playback speed range, complete history, and no ads.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Monthly */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Monthly</h2>
                <p className="text-3xl font-bold text-white mt-1">
                  $4.99 <span className="text-base font-normal text-gray-400">/ month</span>
                </p>
              </div>
              <ul className="text-sm text-gray-400 space-y-1 flex-1">
                <li>Unlimited queue</li>
                <li>All playback speeds</li>
                <li>Full history</li>
                <li>No ads</li>
              </ul>
              <button
                onClick={() => handleSubscribe(MONTHLY_PRICE_ID, 'monthly')}
                disabled={loading !== null}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {loading === 'monthly' ? 'Redirecting…' : 'Subscribe Monthly'}
              </button>
            </div>

            {/* Annual */}
            <div className="bg-gray-900 border border-violet-600 rounded-xl p-6 flex flex-col gap-4 relative">
              <div className="absolute -top-3 left-4">
                <span className="bg-violet-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Save 17%
                </span>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Annual</h2>
                <p className="text-3xl font-bold text-white mt-1">
                  $50 <span className="text-base font-normal text-gray-400">/ year</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">~$4.17/month</p>
              </div>
              <ul className="text-sm text-gray-400 space-y-1 flex-1">
                <li>Unlimited queue</li>
                <li>All playback speeds</li>
                <li>Full history</li>
                <li>No ads</li>
              </ul>
              <button
                onClick={() => handleSubscribe(YEARLY_PRICE_ID, 'yearly')}
                disabled={loading !== null}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                {loading === 'yearly' ? 'Redirecting…' : 'Subscribe Annually'}
              </button>
            </div>
          </div>
        </>
      )}

      {tier === 'paid' && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 text-gray-300 text-sm">
          You have full access to all Pro features. To manage your subscription, visit the{' '}
          <a
            href="https://billing.stripe.com/p/login"
            target="_blank"
            rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 underline"
          >
            Stripe customer portal
          </a>
          .
        </div>
      )}
    </div>
  )
}
