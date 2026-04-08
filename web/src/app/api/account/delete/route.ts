import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/client'
import { NextResponse } from 'next/server'

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Look up Stripe subscription
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('stripe_subscription_id')
    .eq('user_id', user.id)
    .single()

  // Cancel Stripe subscription at period end (if active)
  if (profile?.stripe_subscription_id) {
    try {
      const stripe = getStripe()
      await stripe.subscriptions.update(profile.stripe_subscription_id, {
        cancel_at_period_end: true,
      })
    } catch (err) {
      console.error('Failed to cancel Stripe subscription during account deletion:', err)
      return NextResponse.json({ error: 'stripe_cancel_failed' }, { status: 500 })
    }
  }

  // Delete the auth user via admin client — cascades all user data automatically
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    console.error('Failed to delete auth user:', error)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
