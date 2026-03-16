import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// A chainable Supabase query builder mock. Every method returns the same chain
// object; the chain is also thenable so `await chain` resolves to `result`.
type QueryResult = { data?: unknown; error?: unknown }

function makeChain(result: QueryResult = { data: null, error: null }) {
  const resolved = Promise.resolve(result)
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
    single: vi.fn().mockResolvedValue(result),
  }
  for (const m of ['select', 'eq', 'update', 'not', 'neq']) {
    chain[m] = vi.fn(() => chain)
  }
  return chain
}

const { mockConstructEvent, mockFrom } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}))

import { POST } from './route'

function makeRequest(body: string, sig: string) {
  return new NextRequest('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': sig },
    body,
  })
}

function makeSubEvent(type: string, status: string, userId?: string) {
  return {
    type,
    data: {
      object: {
        id: 'sub_123',
        customer: 'cus_123',
        status,
        metadata: userId ? { supabase_user_id: userId } : {},
      },
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  process.env.STRIPE_SECRET_KEY = 'sk_test'
  mockFrom.mockReturnValue(makeChain())
})

describe('POST /api/stripe/webhook', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const req = new NextRequest('http://localhost/api/stripe/webhook', {
      method: 'POST',
      body: '{}',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/missing stripe-signature/i) })
  })

  it('returns 500 when STRIPE_WEBHOOK_SECRET is not set', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const req = new NextRequest('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig' },
      body: '{}',
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })

  it('returns 400 when signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => { throw new Error('Invalid signature') })
    const res = await POST(makeRequest('{}', 'bad-sig'))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/signature verification failed/i) })
  })

  describe('customer.subscription.created / updated', () => {
    it('upgrades tier to paid for active subscription (user_id in metadata)', async () => {
      mockConstructEvent.mockReturnValue(makeSubEvent('customer.subscription.created', 'active', 'user-abc'))
      const chain = makeChain()
      mockFrom.mockReturnValue(chain)

      const res = await POST(makeRequest('body', 'sig'))

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ received: true })
      expect(mockFrom).toHaveBeenCalledWith('user_profiles')
      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ tier: 'paid' }))
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-abc')
    })

    it('falls back to stripe_customer_id when metadata has no supabase_user_id', async () => {
      mockConstructEvent.mockReturnValue(makeSubEvent('customer.subscription.updated', 'active'))
      const chain = makeChain()
      mockFrom.mockReturnValue(chain)

      const res = await POST(makeRequest('body', 'sig'))

      expect(res.status).toBe(200)
      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ tier: 'paid' }))
      expect(chain.eq).toHaveBeenCalledWith('stripe_customer_id', 'cus_123')
    })

    it('sets tier to free for past_due subscription', async () => {
      mockConstructEvent.mockReturnValue(makeSubEvent('customer.subscription.updated', 'past_due', 'user-abc'))
      const chain = makeChain()
      mockFrom.mockReturnValue(chain)

      const res = await POST(makeRequest('body', 'sig'))

      expect(res.status).toBe(200)
      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ tier: 'free' }))
    })

    it('keeps trialing status as paid', async () => {
      mockConstructEvent.mockReturnValue(makeSubEvent('customer.subscription.created', 'trialing', 'user-abc'))
      const chain = makeChain()
      mockFrom.mockReturnValue(chain)

      const res = await POST(makeRequest('body', 'sig'))

      expect(res.status).toBe(200)
      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ tier: 'paid' }))
    })
  })

  describe('customer.subscription.deleted', () => {
    it('downgrades user by user_id and resets episode filters', async () => {
      mockConstructEvent.mockReturnValue(makeSubEvent('customer.subscription.deleted', 'canceled', 'user-abc'))
      const chain = makeChain()
      mockFrom.mockReturnValue(chain)

      const res = await POST(makeRequest('body', 'sig'))

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ received: true })
      // Downgrade
      expect(chain.update).toHaveBeenCalledWith({ tier: 'free', stripe_subscription_id: null })
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-abc')
      // Reset episode filters on subscriptions table
      expect(mockFrom).toHaveBeenCalledWith('subscriptions')
      expect(chain.update).toHaveBeenCalledWith({ episode_filter: '*' })
    })

    it('looks up user_id by stripe_customer_id when metadata is empty', async () => {
      mockConstructEvent.mockReturnValue(makeSubEvent('customer.subscription.deleted', 'canceled'))
      // single() returns a profile so the subscriptions reset branch fires
      const chain = makeChain()
      chain.single = vi.fn().mockResolvedValue({ data: { user_id: 'user-xyz' }, error: null })
      mockFrom.mockReturnValue(chain)

      const res = await POST(makeRequest('body', 'sig'))

      expect(res.status).toBe(200)
      // Must have selected user_profiles by stripe_customer_id
      expect(chain.select).toHaveBeenCalledWith('user_id')
      expect(chain.eq).toHaveBeenCalledWith('stripe_customer_id', 'cus_123')
      // Must have downgraded
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ tier: 'free', stripe_subscription_id: null })
      )
      // Must have reset filters for the resolved user
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-xyz')
    })
  })

  it('returns received: true for unhandled event types', async () => {
    mockConstructEvent.mockReturnValue({ type: 'invoice.paid', data: { object: {} } })
    const res = await POST(makeRequest('body', 'sig'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
  })
})
