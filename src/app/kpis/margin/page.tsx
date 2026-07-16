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

export default async function MarginPage() {
  const db = adminClient()

  const { data: sold } = await db
    .from('items')
    .select('id, name, purchase_price, target_price, created_at')
    .eq('status', 'sold')
    .not('purchase_price', 'is', null)
    .not('target_price', 'is', null)
    .order('created_at', { ascending: false })

  const totalRev  = sold?.reduce((s, i) => s + (i.target_price || 0), 0) || 0
  const totalCogs = sold?.reduce((s, i) => s + (i.purchase_price || 0), 0) || 0
  const netMargin = totalRev > 0 ? Math.round(((totalRev - totalCogs) / totalRev) * 100) : 0
  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const mc = (m: number) => m >= 30 ? '#22c55e' : m >= 15 ? '#06b6d4' : '#ef4444'

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', paddingBottom: '3rem' }}>
      <Link href="/" style={{ color: '#475569', fontSize: '0.75rem', letterSpacing: '0.08em', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.5rem' }}>
        ← COMMAND CENTER
      </Link>

      <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.25rem', letterSpacing: '0.1em' }}>NET MARGIN</h1>
      <p style={{ color: '#475569', fontSize: '0.75rem', margin: '0 0 2rem' }}>
        Durchschnittliche Netto-Marge über alle verkauften Artikel. Ziel: ≥ 30 %.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Net Margin (Ø)',  value: `${netMargin}%`,                color: mc(netMargin) },
          { label: 'Gesamt-Umsatz',   value: `€${fmt(totalRev)}`,            color: '#06b6d4' },
          { label: 'Gesamt-Gewinn',   value: `€${fmt(totalRev - totalCogs)}`, color: (totalRev - totalCogs) >= 0 ? '#22c55e' : '#ef4444' },
        ].map(s => (
          <div key={s.label} className="kpi-card">
            <div style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ padding: '1.25rem' }}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
          MARGE PRO ARTIKEL <span style={{ color: '#1e293b' }}>//</span>{' '}
          <span style={{ color: '#475569', textShadow: 'none' }}>{sold?.length || 0} VERKÄUFE</span>
        </h2>
        {sold && sold.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Artikel</th>
                <th style={{ textAlign: 'right' }}>EK</th>
                <th style={{ textAlign: 'right' }}>VK</th>
                <th style={{ textAlign: 'right' }}>Marge</th>
                <th style={{ textAlign: 'right' }}>Gewinn</th>
              </tr>
            </thead>
            <tbody>
              {sold.map(item => {
                const ek = item.purchase_price || 0
                const vk = item.target_price || 0
                const m  = vk > 0 ? Math.round(((vk - ek) / vk) * 100) : 0
                const g  = vk - ek
                return (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/items/${item.id}`} style={{ color: '#e0f2fe', textDecoration: 'none' }}>
                        {item.name || 'Unbenannt'}
                      </Link>
                    </td>
                    <td style={{ textAlign: 'right', color: '#64748b' }}>€{fmt(ek)}</td>
                    <td style={{ textAlign: 'right', color: '#06b6d4' }}>€{fmt(vk)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{
                        background: `${mc(m)}22`, color: mc(m),
                        padding: '0.1rem 0.4rem', borderRadius: '4px',
                        fontSize: '0.75rem', fontWeight: 700,
                      }}>{m}%</span>
                    </td>
                    <td style={{ textAlign: 'right', color: g >= 0 ? '#22c55e' : '#ef4444' }}>€{fmt(g)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', color: '#475569', padding: '3rem 0', fontSize: '0.85rem' }}>
            Noch keine Verkäufe vorhanden.
          </div>
        )}
      </div>
    </div>
  )
}
