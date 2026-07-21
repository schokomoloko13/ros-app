import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { savePlatformStats } from './actions'

export const revalidate = 0

const PLATFORM_LABELS: Record<string, string> = {
  'ka-01':        'KA Account 01',
  'ka-02':        'KA Account 02',
  'ka-03':        'KA Account 03',
  'vinted':       'Vinted',
  'kleinanzeigen': 'Kleinanzeigen',
  'ebay':         'eBay',
}

type StatRow = {
  id: string
  account: string
  week_start: string
  views: number
  clicks: number
  likes: number
  dms: number
  saved: number
}

function computePotential(row: Omit<StatRow, 'id' | 'account' | 'week_start'>): number {
  const score = (row.clicks * 3 + row.likes * 2 + row.dms * 10 + row.saved * 4) / Math.max(row.views / 10, 1)
  return Math.min(100, Math.round(score))
}

function potentialColor(score: number): string {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#f97316'
  return '#ef4444'
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function currentMonday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

export default async function PlatformPage({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params
  const label = PLATFORM_LABELS[account] ?? account.toUpperCase()

  const db = adminClient()
  const { data: rows } = await db
    .from('platform_stats')
    .select('*')
    .eq('account', account)
    .order('week_start', { ascending: false })
    .limit(12)

  const stats = (rows as StatRow[] | null || []).map(r => ({
    ...r,
    potential: computePotential(r),
  }))
  const latest = stats[0]
  const weekStart = currentMonday()

  const inputFields = [
    { name: 'views',  label: 'Views' },
    { name: 'clicks', label: 'Klicks' },
    { name: 'likes',  label: 'Likes' },
    { name: 'dms',    label: 'DMs' },
    { name: 'saved',  label: 'Gespeichert' },
  ]

  return (
    <div className="page-shell">
      {/* Breadcrumb */}
      <div className="crumbs" style={{ marginBottom: '1.5rem' }}>
        <Link href="/" style={{ color: '#475569', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none' }}>
          ← COMMAND CENTER
        </Link>
        <span style={{ color: '#1e293b' }}>/</span>
        <span style={{ color: '#06b6d4', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>

      <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.25rem', letterSpacing: '0.1em' }}>
        {label.toUpperCase()} ACCOUNT
      </h1>
      <p style={{ color: '#475569', fontSize: '0.75rem', margin: '0 0 2rem' }}>
        Plattform-Performance · Wöchentliche Tracking-Daten
      </p>

      {/* KPI row — only if we have data */}
      {latest && (
        <div className="r-stats-6" style={{ marginBottom: '1.5rem' }}>
          {[
            { label: 'Views',       value: String(latest.views),              color: '#e0f2fe' },
            { label: 'Klicks',      value: String(latest.clicks),             color: '#06b6d4' },
            { label: 'Likes',       value: String(latest.likes),              color: '#c084fc' },
            { label: 'DMs',         value: String(latest.dms),                color: '#22c55e' },
            { label: 'Gespeichert', value: String(latest.saved),              color: '#f97316' },
            { label: 'Potenzial',   value: String(latest.potential),           color: potentialColor(latest.potential) },
          ].map(s => (
            <div key={s.label} className="kpi-card">
              <div style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>{s.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="r-split-300">
        {/* History table */}
        <div className="panel" style={{ padding: '1.25rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
            VERLAUF <span style={{ color: '#1e293b' }}>//</span>{' '}
            <span style={{ color: '#475569' }}>WÖCHENTLICH</span>
          </h2>
          {stats.length === 0 ? (
            <div style={{ color: '#475569', fontSize: '0.75rem', padding: '3rem', textAlign: 'center' }}>
              Noch keine Daten. Trage die erste Woche rechts ein.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Woche</th>
                  <th style={{ textAlign: 'right' }}>Views</th>
                  <th style={{ textAlign: 'right' }}>Klicks</th>
                  <th style={{ textAlign: 'right' }}>Likes</th>
                  <th style={{ textAlign: 'right' }}>DMs</th>
                  <th style={{ textAlign: 'right' }}>Gespeichert</th>
                  <th style={{ textAlign: 'right' }}>Potenzial</th>
                </tr>
              </thead>
              <tbody>
                {stats.map(row => (
                  <tr key={row.id}>
                    <td style={{ color: '#64748b' }}>{row.week_start}</td>
                    <td style={{ textAlign: 'right' }}>{row.views}</td>
                    <td style={{ textAlign: 'right', color: '#06b6d4' }}>{row.clicks}</td>
                    <td style={{ textAlign: 'right', color: '#c084fc' }}>{row.likes}</td>
                    <td style={{ textAlign: 'right', color: '#22c55e' }}>{row.dms}</td>
                    <td style={{ textAlign: 'right', color: '#f97316' }}>{row.saved}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: potentialColor(row.potential) }}>
                      {row.potential}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Input form */}
        <div className="panel" style={{ padding: '1.25rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
            EINTRAGEN <span style={{ color: '#1e293b' }}>//</span>{' '}
            <span style={{ color: '#475569' }}>NEUE WOCHE</span>
          </h2>
          <form action={savePlatformStats} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <input type="hidden" name="account" value={account} />

            <div>
              <label style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '0.3rem' }}>
                Woche (Montag)
              </label>
              <input
                type="date"
                name="week_start"
                defaultValue={weekStart}
                required
                style={{
                  width: '100%', background: '#050a14', border: '1px solid #1e293b',
                  borderRadius: '6px', color: '#e0f2fe', fontSize: '0.8rem',
                  padding: '0.5rem 0.75rem', fontFamily: 'inherit', boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            {inputFields.map(f => (
              <div key={f.name}>
                <label style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '0.3rem' }}>
                  {f.label}
                </label>
                <input
                  type="number"
                  name={f.name}
                  min="0"
                  defaultValue="0"
                  required
                  style={{
                    width: '100%', background: '#050a14', border: '1px solid #1e293b',
                    borderRadius: '6px', color: '#e0f2fe', fontSize: '0.8rem',
                    padding: '0.5rem 0.75rem', fontFamily: 'inherit', boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>
            ))}

            <div style={{ padding: '0.5rem 0.75rem', background: '#050a14', border: '1px solid #0f172a', borderRadius: '6px', marginTop: '0.1rem' }}>
              <div style={{ fontSize: '0.55rem', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>Potenzial-Formel</div>
              <div style={{ fontSize: '0.62rem', color: '#334155', lineHeight: 1.6 }}>
                (Klicks×3 + Likes×2 + DMs×10 + Gespeichert×4) ÷ max(Views÷10, 1)
              </div>
            </div>

            <button
              type="submit"
              style={{
                padding: '0.65rem', marginTop: '0.1rem',
                background: 'rgba(6,182,212,0.1)', border: '1px solid #06b6d4',
                borderRadius: '6px', color: '#06b6d4', fontSize: '0.75rem',
                fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Speichern
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
