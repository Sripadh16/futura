import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getSupabase } from '../lib/supabase'
import type { Env, Variables } from '../types'

const router = new Hono<{ Bindings: Env; Variables: Variables }>()

const purchaseSchema = z.object({
  razorpay_payment_id: z.string().min(1)
})

// Conversion Rate: 10 Zens per 1 INR (100 paise)
// Zens = Paise / 10
const PAISES_PER_ZEN = 10

router.get('/balance', async (c) => {
  const supabase = getSupabase(c.env, c.get('token'))
  const { data, error } = await supabase
    .from('profiles')
    .select('zens')
    .eq('id', c.get('userId'))
    .single()

  if (error) {
    return c.json({ error: error.message }, 500)
  }

  return c.json({ zens: data.zens })
})

router.post('/purchase', zValidator('json', purchaseSchema), async (c) => {
  const userId = c.get('userId')
  const { razorpay_payment_id } = c.req.valid('json')

  // Verify the payment with Razorpay API
  const keyId = (c.env.RAZORPAY_KEY_ID || '').trim()
  const keySecret = (c.env.RAZORPAY_KEY_SECRET || '').trim()
  const credentials = btoa(`${keyId}:${keySecret}`)
  const rzpRes = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`,
    {
      method: 'GET',
      headers: { Authorization: `Basic ${credentials}` }
    }
  )

  if (!rzpRes.ok) {
    return c.json({ error: 'razorpay_verification_failed' }, 400)
  }

  let payment = (await rzpRes.json()) as { status: string; amount: number }

  // Auto-capture authorized payments (common in Test Mode)
  if (payment.status === 'authorized') {
    const captureRes = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}/capture`,
      {
        method: 'POST',
        headers: { 
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ amount: payment.amount, currency: "INR" })
      }
    )
    if (captureRes.ok) {
      payment = (await captureRes.json()) as { status: string; amount: number }
    }
  }

  if (payment.status !== 'captured') {
    return c.json({ error: 'payment_not_captured', status: payment.status }, 400)
  }

  const zensPurchased = Math.floor(payment.amount / PAISES_PER_ZEN)
  
  if (zensPurchased < 100) {
    return c.json({ error: 'amount_too_low_minimum_100_zens' }, 400)
  }

  // Credit the Zens to the user's profile
  const supabase = getSupabase(c.env)
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('zens')
    .eq('id', userId)
    .single()

  if (fetchError || !profile) {
    return c.json({ error: 'profile_not_found' }, 404)
  }

  const newBalance = (profile.zens ?? 0) + zensPurchased

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ zens: newBalance })
    .eq('id', userId)

  if (updateError) {
    return c.json({ error: updateError.message }, 500)
  }

  return c.json({ success: true, zens: newBalance })
})

const spendSchema = z.object({
  amount: z.number().positive().int() // Enforce integer Zens
})

router.post('/spend', zValidator('json', spendSchema), async (c) => {
  const userId = c.get('userId')
  const { amount } = c.req.valid('json')

  const supabase = getSupabase(c.env)
  
  // 1. Get current balance
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('zens')
    .eq('id', userId)
    .single()

  if (fetchError || !profile) {
    return c.json({ error: 'profile_not_found' }, 404)
  }

  // 2. Check sufficient balance
  if (profile.zens < amount) {
    return c.json({ error: 'insufficient_funds', current_balance: profile.zens }, 400)
  }

  // 3. Deduct securely
  const newBalance = profile.zens - amount
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ zens: newBalance })
    .eq('id', userId)

  if (updateError) {
    return c.json({ error: updateError.message }, 500)
  }

  return c.json({ success: true, zens: newBalance })
})

const creditSchema = z.object({
  amount: z.number().positive().int() // Zens to credit
})

router.post('/credit', zValidator('json', creditSchema), async (c) => {
  const userId = c.get('userId')
  const { amount } = c.req.valid('json')

  const supabase = getSupabase(c.env)
  
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('zens')
    .eq('id', userId)
    .single()

  if (fetchError || !profile) {
    return c.json({ error: 'profile_not_found' }, 404)
  }

  const newBalance = profile.zens + amount
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ zens: newBalance })
    .eq('id', userId)

  if (updateError) {
    return c.json({ error: updateError.message }, 500)
  }

  return c.json({ success: true, zens: newBalance })
})

export { router as zensRouter }
