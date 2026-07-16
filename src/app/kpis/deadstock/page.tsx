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

export default async function DeadstockPage() {
  const db = adminClient()

  const { data: items } = await db
    .from('items')
    .select('id, name, purchase_price, created_at')
    .eq('status', 'purchased')
    .order('created_at', { ascending: true })

  const now = Date.now()
  const withDays = (items || []).map(i => ({
    ...i,
    days: Math.floor((now - new Date(i.created_at).getTime()) / 86_400_000),
  }))
  const dead   = withDays.filter(i => i.days > 14)
  const urgent = withDays.filter(i => i.days > 7 && i.days <= 14)
  const totalEk = dead.reduce((s, i) => s + (i.purchase_price || 0), 0)
  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', paddingBottom: '3rem' }}>
      <Link href="/" style={{ color: '#475569', fontSize: '0.75rem', letterSpacing: '0.08em', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.5rem' }}>
        ← COMMAND CENTER
      </Link>

      <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.25rem', letterSpacing: '0.1em' }}>DEAD STOCK</h1>
      <p style={{ color: '#475569', fontSize: '0.75rem', margin: '0 0 2rem' }}>
        Artikel mit Status "Eingekauft" die länger als 14 Tage nicht gelistet wurden. Handlungsbedarf!
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Dead (>14d)',  value: String(dead.length),   color: dead.length > 0 ? '#ef4444' : '#22c55e' },
          { label: 'Urgent (>7d)', value: String(urgent.length), color: urgent.length > 0 ? '#f97316' : '#475569' },
          { label: 'Frisch (≤7d)', value: String(withDays.filter(i => i.days <= 7).length), color: '#22c55e' },
          { label: 'EK gebunden',  value: `€${fmt(totalEk)}`,   color: dead.length > 0 ? '#ef4444' : '#475569' },
        ].map(s => (
          <div key={s.label} className="kpi-card">
            <div style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {dead.length > 0 && (
        <div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem', borderColor: 'rgba(239,68,68,0.3)' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em', color: '#ef4444' }}>
            ⚠ SOFORT LISTEN <span style={{ color: '#334155' }}>//</span>{' '}
            <span style={{ color: '#475569', textShadow: 'none' }}>&gt; 14 TAGE UNLISTED</span>
          </h2>
          <table>
            <thead><tr><th>Artikel</th><th style={{ textAlign: 'right' }}>EK</th><th style={{ textAlign: 'right' }}>Alter</th></tr></thead>
            <tbody>
              {dead.map(item => (
                <tr key={item.id}>
                  <td><Link href={`/items/${item.id}`} style={{ color: '#e0f2fe', textDecoration: 'none' }}>{item.name || 'Unbenannt'}</Link></td>
                  <td style={{ textAlign: 'right', color: '#06b6d4' }}>€{fmt(item.purchase_price || 0)}</td>
                  <td style={{ textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>{item.days}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {urgent.length > 0 && (
        <div className="panel" style={{ padding: '1.25rem', borderColor: 'rgba(249,115,22,0.3)' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em', color: '#f97316' }}>
            URGENT <span style={{ color: '#334155' }}>//</span>{' '}
            <span style={{ color: '#475569', textShadow: 'none' }}>7–14 TAGE</span>
          </h2>
          <table>
            <thead><tr><th>Artikel</th><th style={{ textAlign: 'right' }}>EK</th><th style={{ textAlign: 'right' }}>Alter</th></tr></thead>
            <tbody>
              {urgent.map(item => (
                <tr key={item.id}>
                  <td><Link href={`/items/${item.id}`} style={{ color: '#e0f2fe', textDecoration: 'none' }}>{item.name || 'Unbenannt'}</Link></td>
                  <td style={{ textAlign: 'right', color: '#06b6d4' }}>€{fmt(item.purchase_price || 0)}</td>
                  <td style={{ textAlign: 'right', color: '#f97316' }}>{item.days}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dead.length === 0 && urgent.length === 0 && (
        <div className="panel" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
          <div style={{ color: '#22c55e', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.08em' }}>KEIN DEAD STOCK</div>
          <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: '0.5rem' }}>Alle Artikel sind frisch.</div>
        </div>
      )}
    </div>
  )
}
