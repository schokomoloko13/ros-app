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

export default async function RevenuePage() {
  const db = adminClient()
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const { data: sold } = await db
    .from('items')
    .select('id, name, purchase_price, target_price, created_at')
    .eq('status', 'sold')
    .gte('created_at', firstOfMonth)
    .order('created_at', { ascending: false })

  const revenue = sold?.reduce((s, i) => s + (i.target_price || 0), 0) || 0
  const cogs    = sold?.reduce((s, i) => s + (i.purchase_price || 0), 0) || 0
  const profit  = revenue - cogs
  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="page-shell">
      <Link href="/" style={{ color: '#475569', fontSize: '0.75rem', letterSpacing: '0.08em', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.5rem' }}>
        ← COMMAND CENTER
      </Link>

      <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.25rem', letterSpacing: '0.1em' }}>REVENUE MONTH</h1>
      <p style={{ color: '#475569', fontSize: '0.75rem', margin: '0 0 2rem' }}>
        Umsatz aus verkauften Artikeln im laufenden Monat ({now.toLocaleString('de-DE', { month: 'long', year: 'numeric' })})
      </p>

      <div className="r-stats-3" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Umsatz (VK)',  value: `€${fmt(revenue)}`, color: '#22c55e' },
          { label: 'Einkauf (EK)', value: `€${fmt(cogs)}`,    color: '#06b6d4' },
          { label: 'Gewinn',       value: `€${fmt(profit)}`,  color: profit >= 0 ? '#22c55e' : '#ef4444' },
        ].map(s => (
          <div key={s.label} className="kpi-card">
            <div style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ padding: '1.25rem' }}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
          VERKAUFTE ARTIKEL <span style={{ color: '#1e293b' }}>//</span>{' '}
          <span style={{ color: '#475569', textShadow: 'none' }}>{sold?.length || 0} STÜCK</span>
        </h2>
        {sold && sold.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Artikel</th>
                <th style={{ textAlign: 'right' }}>EK</th>
                <th style={{ textAlign: 'right' }}>VK</th>
                <th style={{ textAlign: 'right' }}>Gewinn</th>
                <th style={{ textAlign: 'right' }}>Marge</th>
              </tr>
            </thead>
            <tbody>
              {sold.map(item => {
                const ek = item.purchase_price || 0
                const vk = item.target_price || 0
                const g  = vk - ek
                const m  = vk > 0 ? Math.round((g / vk) * 100) : 0
                return (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/items/${item.id}`} style={{ color: '#e0f2fe', textDecoration: 'none' }}>
                        {item.name || 'Unbenannt'}
                      </Link>
                    </td>
                    <td style={{ textAlign: 'right', color: '#64748b' }}>€{fmt(ek)}</td>
                    <td style={{ textAlign: 'right', color: '#06b6d4' }}>€{fmt(vk)}</td>
                    <td style={{ textAlign: 'right', color: g >= 0 ? '#22c55e' : '#ef4444' }}>€{fmt(g)}</td>
                    <td style={{ textAlign: 'right', color: m >= 30 ? '#22c55e' : m > 0 ? '#06b6d4' : '#ef4444' }}>{m}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', color: '#475569', padding: '3rem 0', fontSize: '0.85rem' }}>
            Noch keine Verkäufe diesen Monat.
          </div>
        )}
      </div>
    </div>
  )
}
