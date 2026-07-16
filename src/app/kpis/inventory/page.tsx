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

const STATUS_LABEL: Record<string, string> = {
  purchased: 'Eingekauft', checked: 'Geprüft', photographed: 'Fotografiert', listed: 'Gelistet',
}
const STATUS_CLASS: Record<string, string> = {
  purchased: 'status-purchased', checked: 'status-checked',
  photographed: 'status-photographed', listed: 'status-listed',
}

export default async function InventoryPage() {
  const db = adminClient()

  const { data: items } = await db
    .from('items')
    .select('id, name, purchase_price, status, category_id, created_at')
    .neq('status', 'sold')
    .order('purchase_price', { ascending: false })

  const totalValue = items?.reduce((s, i) => s + (i.purchase_price || 0), 0) || 0
  const byStatus = (s: string) => items?.filter(i => i.status === s).length || 0
  const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', paddingBottom: '3rem' }}>
      <Link href="/" style={{ color: '#475569', fontSize: '0.75rem', letterSpacing: '0.08em', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.5rem' }}>
        ← COMMAND CENTER
      </Link>

      <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.25rem', letterSpacing: '0.1em' }}>INVENTORY VALUE</h1>
      <p style={{ color: '#475569', fontSize: '0.75rem', margin: '0 0 2rem' }}>
        Gesamtwert aller Artikel im Lager (Einkaufspreis-Basis, exkl. verkaufte Artikel).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Gesamtwert (EK)', value: `€${fmt(totalValue)}`,        color: '#06b6d4' },
          { label: 'Artikel total',   value: String(items?.length || 0),    color: '#e0f2fe' },
          { label: 'Unlisted',        value: String(byStatus('purchased')), color: '#facc15' },
          { label: 'Gelistet',        value: String(byStatus('listed')),    color: '#4ade80' },
        ].map(s => (
          <div key={s.label} className="kpi-card">
            <div style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ padding: '1.25rem' }}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
          ALLE ARTIKEL <span style={{ color: '#1e293b' }}>//</span>{' '}
          <span style={{ color: '#475569', textShadow: 'none' }}>SORTIERT NACH EK</span>
        </h2>
        {items && items.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Artikel</th>
                <th style={{ textAlign: 'right' }}>EK</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Alter</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const days = Math.floor((Date.now() - new Date(item.created_at).getTime()) / 86_400_000)
                return (
                  <tr key={item.id}>
                    <td>
                      <Link href={`/items/${item.id}`} style={{ color: '#e0f2fe', textDecoration: 'none' }}>
                        {item.name || 'Unbenannt'}
                      </Link>
                    </td>
                    <td style={{ textAlign: 'right', color: '#06b6d4' }}>€{fmt(item.purchase_price || 0)}</td>
                    <td>
                      <span className={`status-badge ${STATUS_CLASS[item.status] || 'status-purchased'}`}>
                        {STATUS_LABEL[item.status] || item.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', color: days > 14 ? '#ef4444' : '#475569' }}>{days}d</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ textAlign: 'center', color: '#475569', padding: '3rem 0', fontSize: '0.85rem' }}>
            Kein Inventar vorhanden.
          </div>
        )}
      </div>
    </div>
  )
}
