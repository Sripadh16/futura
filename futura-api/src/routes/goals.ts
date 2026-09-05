import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getSupabase } from '../lib/supabase'
import type { Env, Variables } from '../types'

const router = new Hono<{ Bindings: Env; Variables: Variables }>()

const goalsSchema = z.object({
  current_age: z.number().int().min(10).max(100),
  retirement_age: z.number().int().min(18).max(120),
  target_monthly_income: z.number().positive().max(1000000000),
  annual_return_rate: z.number().min(0).max(1).optional(),
  risk_profile: z.enum(['conservative', 'moderate', 'aggressive']).optional()
})

router.get('/', async (c) => {
  const supabase = getSupabase(c.env, c.get('token'))
  const { data, error } = await supabase
    .from('user_goals')
    .select('*')
    .eq('user_id', c.get('userId'))
    .maybeSingle()

  if (error) {
    return c.json({ error: error.message }, 500)
  }

  return c.json({ goal: data })
})

router.post('/', zValidator('json', goalsSchema), async (c) => {
  const userId = c.get('userId')
  const userName = c.get('userName')
  const userEmail = c.get('userEmail')
  const body = c.req.valid('json')
  const supabaseAdmin = getSupabase(c.env)

  // 1. Ensure profile row exists and sync onboarding fields
  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('zens')
    .eq('id', userId)
    .maybeSingle()

  const initialZens = (existingProfile && existingProfile.zens >= 100) ? existingProfile.zens : 100

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: userEmail,
        display_name: userName,
        age: body.current_age,
        retirement_age: body.retirement_age,
        target_monthly_income: body.target_monthly_income,
        monthly_income: body.target_monthly_income,
        onboarding_complete: true,
        zens: initialZens
      },
      { onConflict: 'id' }
    )

  if (profileError) {
    console.error('Supabase profile create error:', profileError)
    return c.json({ error: 'Failed to initialize user profile: ' + profileError.message }, 500)
  }

  // 2. Ensure subscription row exists (free tier seed — non-fatal if already present)
  await supabaseAdmin
    .from('user_subscriptions')
    .upsert(
      {
        user_id: userId,
        entitlement: 'free',
        streak_recovery_tokens: 0,
        display_name: userName,
        last_token_reset: new Date().toISOString()
      },
      { onConflict: 'user_id', ignoreDuplicates: true }
    )

  // 3. Ensure streak row exists (non-fatal)
  await supabaseAdmin
    .from('streaks')
    .upsert(
      {
        user_id: userId,
        current_streak: 0,
        longest_streak: 0,
        previous_streak: 0
      },
      { onConflict: 'user_id', ignoreDuplicates: true }
    )

  // 4. Upsert user_goals
  const { data, error } = await supabaseAdmin
    .from('user_goals')
    .upsert(
      {
        user_id: userId,
        ...body,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single()

  if (error) {
    console.error('Supabase goals error:', error)
    return c.json({ error: error.message }, 500)
  }

  return c.json({ goal: data }, 201)
})


export { router as goalsRouter }
