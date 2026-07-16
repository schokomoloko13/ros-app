import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

export const revalidate = 0

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function RunwayPage() {
  const db = adminClient()
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [{ data: inventory }, { data: soldThisMonth }] = await Promise.all([
    db.from('items').select('purchase_price').neq('status', 'sold'),
    db.from('items').select('target_price').eq('status', 'sold').gte('created_at', firstOfMonth),
  ])

  const inventoryValue = inventory?.reduce((s, i) => s + (i.purchase_price || 0), 0) || 0
  const revenueMonth   = soldThisMonth?.reduce((s, i) => s + (i.target_price || 0), 0) || 0
  const runway = inventoryValue > 0 && revenueMonth > 0 ? inventoryValue / revenueMonth : null
  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const rc = runway === null ? '#475569' : runway > 6 ? '#22c55e' : runway > 3 ? '#06b6d4' : '#ef4444'

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', paddingBottom: '3rem' }}>
      <Link href="/" style={{ color: '#475569', fontSize: '0.75rem', letterSpacing: '0.08em', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.5rem' }}>
        ← COMMAND CENTER
      </Link>

      <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.25rem', letterSpacing: '0.1em' }}>STOCK RUNWAY</h1>
      <p style={{ color: '#475569', fontSize: '0.75rem', margin: '0 0 2rem' }}>
        Wie viele Monate reicht das aktuelle Inventar bei der aktuellen Verkaufsrate?
        Formel: <span style={{ color: '#06b6d4' }}>Inventarwert (EK) ÷ Monats-Umsatz</span>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Runway',              value: runway !== null ? `${runway.toFixed(1)} Mo` : '—', color: rc },
          { label: 'Inventarwert (EK)',   value: `€${fmt(inventoryValue)}`, color: '#06b6d4' },
          { label: 'Umsatz diesen Monat', value: revenueMonth > 0 ? `€${fmt(revenueMonth)}` : '—', color: '#22c55e' },
        ].map(s => (
          <div key={s.label} className="kpi-card">
            <div style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ padding: '1.5rem' }}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>WAS BEDEUTET DAS?</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.7 }}>
          <p style={{ margin: 0 }}>
            Der <span style={{ color: '#06b6d4' }}>Stock Runway</span> zeigt, wie lange dein Inventar reicht,
            wenn du im gleichen Tempo verkaufst wie diesen Monat.
          </p>
          <p style={{ margin: 0 }}>
            <span style={{ color: '#22c55e' }}>≥ 6 Monate</span> — genug Bestand. &nbsp;
            <span style={{ color: '#06b6d4' }}>3–6 Monate</span> — ok. &nbsp;
            <span style={{ color: '#ef4444' }}>&lt; 3 Monate</span> — aktiv nachkaufen.
          </p>
          {revenueMonth === 0 && (
            <p style={{ margin: 0, color: '#f97316' }}>
              ⚠ Noch keine Verkäufe diesen Monat — Runway kann nicht berechnet werden.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
