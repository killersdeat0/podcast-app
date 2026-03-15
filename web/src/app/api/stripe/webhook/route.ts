import { getStripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

// Disable body parsing — we need the raw body for Stripe signature verification
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const stripe = getStripe()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 })
  }

  const supabase = createAdminClient()

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id

      const isActive = subscription.status === 'active' || subscription.status === 'trialing'
      const tier = isActive ? 'paid' : 'free'
      const userId = subscription.metadata?.supabase_user_id

      if (userId) {
        const { error } = await supabase
          .from('user_profiles')
          .update({ tier, stripe_customer_id: customerId, stripe_subscription_id: subscription.id })
          .eq('user_id', userId)
        if (error) console.error('Webhook: failed to update user_profiles by user_id', error)
      } else {
        const { error } = await supabase
          .from('user_profiles')
          .update({ tier, stripe_subscription_id: subscription.id })
          .eq('stripe_customer_id', customerId)
        if (error) console.error('Webhook: failed to update user_profiles by stripe_customer_id', error)
      }

      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id

      const userId = subscription.metadata?.supabase_user_id

      if (userId) {
        const { error } = await supabase
          .from('user_profiles')
          .update({ tier: 'free', stripe_subscription_id: null })
          .eq('user_id', userId)
        if (error) console.error('Webhook: failed to downgrade user_profiles by user_id', error)
        await supabase
          .from('subscriptions')
          .update({ episode_filter: '*' })
          .eq('user_id', userId)
          .not('episode_filter', 'is', null)
          .neq('episode_filter', '')
          .neq('episode_filter', '*')
      } else {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single()
        const { error } = await supabase
          .from('user_profiles')
          .update({ tier: 'free', stripe_subscription_id: null })
          .eq('stripe_customer_id', customerId)
        if (error) console.error('Webhook: failed to downgrade user_profiles by stripe_customer_id', error)
        if (profile?.user_id) {
          await supabase
            .from('subscriptions')
            .update({ episode_filter: '*' })
            .eq('user_id', profile.user_id)
            .not('episode_filter', 'is', null)
            .neq('episode_filter', '')
            .neq('episode_filter', '*')
        }
      }

      break
    }

    default:
      break
  }

  return NextResponse.json({ received: true })
}
