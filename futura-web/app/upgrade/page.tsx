'use client'

import { useEffect, useState } from 'react'
import { PaywallModal } from '../../components/PaywallModal'
import { api } from '../../lib/api'

export default function UpgradePage() {
  const [zens, setZens] = useState<number | null>(null)
  const [isPro, setIsPro] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [message, setMessage] = useState('')

  const loadProfile = async () => {
    try {
      const result = await api.profile.get() as {
        profile?: { zens: number }
        subscription?: { entitlement: string; expires_at: string | null }
      }

      setZens(result?.profile?.zens ?? 0)

      const sub = result?.subscription
      const active =
        sub?.entitlement === 'pro' &&
        (!sub.expires_at || new Date(sub.expires_at) > new Date())
      setIsPro(active)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    void loadProfile()
  }, [])

  const handlePurchasePro = async () => {
    setPurchasing(true)
    setMessage('')
    try {
      await api.subscriptions.purchasePro()
      setMessage('Pro unlocked for 30 days!')
      await loadProfile()
    } catch (err: any) {
      const msg = err?.message ?? ''
      if (msg.includes('insufficient_zens')) {
        setMessage('Not enough Zens. Buy more below!')
      } else {
        setMessage('Failed to purchase Pro. Please try again.')
      }
    } finally {
      setPurchasing(false)
    }
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>Upgrade to Futura Pro</h1>

      <div style={{ padding: '1.5rem', border: '1px solid #eaeaea', borderRadius: '8px', marginBottom: '1.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <h2 style={{ marginTop: 0 }}>Your Balance</h2>
        <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
          {zens !== null ? `🪙 ${zens} Zens` : 'Loading...'}
        </p>
        {isPro && <p style={{ color: 'green', fontWeight: 'bold' }}>✅ Pro is active</p>}
      </div>

      <div style={{ padding: '1.5rem', border: '1px solid #eaeaea', borderRadius: '8px', marginBottom: '1.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <h2 style={{ marginTop: 0 }}>Unlock Pro — 500 Zens for 30 Days</h2>
        <p style={{ color: '#666', marginBottom: '1rem' }}>Get access to advanced projection scenarios and custom allocations.</p>
        <button
          type="button"
          onClick={handlePurchasePro}
          disabled={purchasing || isPro || (zens !== null && zens < 500)}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: isPro || (zens !== null && zens < 500) ? '#ccc' : '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isPro || (zens !== null && zens < 500) ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            width: '100%'
          }}
        >
          {isPro
            ? 'Already Pro'
            : zens !== null && zens < 500
              ? `Need ${500 - zens} more Zens`
              : purchasing
                ? 'Processing...'
                : 'Unlock Pro (500 Zens)'}
        </button>
        {message && (
          <p style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#f0fdf4', color: '#166534', borderRadius: '4px', textAlign: 'center' }}>
            {message}
          </p>
        )}
      </div>

      <div style={{ padding: '1.5rem', border: '1px solid #eaeaea', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <h2 style={{ marginTop: 0 }}>Buy Zens</h2>
        <p style={{ color: '#666', marginBottom: '1rem' }}>Need more Zens? Top up your balance securely via Razorpay.</p>
        <PaywallModal onSuccess={(newBalance) => setZens(newBalance)} />
      </div>
    </main>
  )
}
