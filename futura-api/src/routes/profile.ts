import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getSupabase } from '../lib/supabase'
import type { Env, Variables } from '../types'

const router = new Hono<{ Bindings: Env; Variables: Variables }>()

const profileUpdateSchema = z.object({
  display_name: z.string().min(1).max(120).optional(),
  bio: z.string().max(500).optional(),
  age: z.number().int().min(10).max(120).optional(),
  retirement_age: z.number().int().min(18).max(120).optional(),
  monthly_income: z.number().positive().optional(),
  onboarding_complete: z.boolean().optional(),
  liquid_cash: z.number().int().min(0).optional()
})

router.get('/', async (c) => {
  const supabaseAdmin = getSupabase(c.env)
  const supabase = getSupabase(c.env, c.get('token'))
  const userId = c.get('userId')

  // Fetch existing profile (bypass RLS for existence check)
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    return c.json({ error: profileError.message }, 500)
  }

  if (!profile) {
    return c.json({ error: 'Profile not found' }, 404)
  }

  // Best-effort monthly token refresh — non-fatal if RPC fails
  const { error: refreshErr } = await supabase.rpc('refresh_elite_monthly_streak_tokens', {
    p_user_id: userId
  })
  if (refreshErr) {
    console.warn('[profile] refresh_elite_monthly_streak_tokens failed (non-fatal):', refreshErr.message)
    // Do not return 500 — continue to return the profile and current subscription data
  }

  const { data: subscription, error: subError } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (subError) {
    return c.json({ error: subError.message }, 500)
  }

  return c.json({ profile, subscription })
})

router.patch('/', zValidator('json', profileUpdateSchema), async (c) => {
  const userId = c.get('userId')
  const body = c.req.valid('json')

  // Use UPDATE — profile row is guaranteed to exist by the time any PATCH is called.
  // upsert would attempt INSERT on miss, which fails the email NOT NULL constraint.
  const supabaseAdmin = getSupabase(c.env)
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ ...body })
    .eq('id', userId)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('Supabase update error:', error)
    return c.json({ error: error.message }, 500)
  }

  if (body.display_name !== undefined) {
    await supabaseAdmin
      .from('user_subscriptions')
      .update({ display_name: body.display_name })
      .eq('user_id', userId)
  }

  return c.json({ profile: data })
})

export { router as profileRouter }
