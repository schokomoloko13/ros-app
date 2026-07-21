import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

// TEMPO (/tempo) — wie schnell verkauft sich was:
// Listing → Verkauf (Schnellseller), Listing → heute (Ladenhüter),
// Kauf → heute (Wartende — antizyklische Käufe, bewusst kein Deadstock).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export const revalidate = 30

const STATUS_LABEL: Record<string, string> = {
  purchased: 'Eingekauft', checked: 'Geprüft', photographed: 'Fotografiert', listed: 'Gelistet', sold: 'Verkauft',
}

function dayDiff(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000))
}

function deDate(d?: string | null): string {
  return d ? new Date(d).toLocaleDateString('de-DE') : '—'
}

const eur = (n: number) =>
  '€' + Number(n).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

type Entry = { i: any; d: number }

function TempoRow({ entry, color, meta }: { entry: Entry; color: string; meta?: string }) {
  const { i, d } = entry
  return (
    <Link href={`/items/${i.id}`} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem',
      padding: '0.45rem 0', borderBottom: '1px solid #0f172a', textDecoration: 'none',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.75rem', color: '#e0f2fe', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {i.name || 'Unbenannt'}
        </div>
        <div style={{ fontSize: '0.6rem', color: '#475569' }}>
          {i.brand || STATUS_LABEL[i.status] || ''}{meta ? ` · ${meta}` : ''}
        </div>
      </div>
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color, flexShrink: 0 }}>{d}d</div>
    </Link>
  )
}

function TempoPanel({ title, sub, entries, color, empty, note }: {
  title: string; sub: string; entries: Entry[]; color: string; empty: string; note?: string
}) {
  return (
    <div className="panel" style={{ padding: '1rem' }}>
      <h2 style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
        {title} <span style={{ color: '#1e293b' }}>//</span>{' '}
        <span style={{ color: '#475569' }}>{sub}</span>
      </h2>
      <div style={{ fontSize: '0.6rem', color: '#334155', marginBottom: '0.5rem' }}>{entries.length} Artikel</div>
      {entries.length === 0 && <div style={{ fontSize: '0.72rem', color: '#334155' }}>{empty}</div>}
      {entries.map(e => (
        <TempoRow key={e.i.id} entry={e} color={color(e)} meta={undefined} />
      ))}
      {note && <div style={{ fontSize: '0.58rem', color: '#334155', marginTop: '0.5rem', lineHeight: 1.5 }}>{note}</div>}
    </div>
  )
}

export default async function TempoPage() {
  const { data: items } = await supabase
    .from('items')
    .select('id, name, brand, status, purchase_price, target_price, sold_price, sold_at, listed_at, purchase_date, created_at')
    .order('created_at', { ascending: false })

  const all = items || []
  const now = new Date().toISOString()

  const sold: Entry[] = all
    .filter(i => i.status === 'sold' && i.sold_at)
    .map(i => ({ i, d: dayDiff(String(i.listed_at ?? i.purchase_date ?? i.created_at), String(i.sold_at)) }))
    .sort((a, b) => a.d - b.d)

  const listed: Entry[] = all
    .filter(i => i.status === 'listed')
    .map(i => ({ i, d: dayDiff(String(i.listed_at ?? i.created_at), now) }))
    .sort((a, b) => b.d - a.d)

  const waiting: Entry[] = all
    .filter(i => ['purchased', 'checked', 'photographed'].includes(i.status))
    .map(i => ({ i, d: dayDiff(String(i.purchase_date ?? i.created_at), now) }))
    .sort((a, b) => b.d - a.d)

  const avg = (xs: Entry[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x.d, 0) / xs.length) : null)
  const over30 = listed.filter(x => x.d > 30).length

  const stats = [
    { label: 'Ø TAGE BIS VERKAUF', value: avg(sold) ?? '—', color: '#06b6d4' },
    { label: 'VERKÄUFE MIT DATUM', value: sold.length, color: '#22c55e' },
    { label: 'Ø TAGE ONLINE (AKTIV)', value: avg(listed) ?? '—', color: '#c084fc' },
    { label: 'ONLINE > 30 TAGE', value: over30, color: over30 ? '#f97316' : '#475569' },
  ]

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', margin: 0, letterSpacing: '0.05em' }}>TEMPO</h1>
        <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
          Listing → Verkauf · Listing → heute · Kauf → heute
        </p>
      </div>

      <div className="r-stats-4" style={{ marginBottom: '1rem' }}>
        {stats.map(s => (
          <div key={s.label} className="kpi-card">
            <div className="kpi-label" style={{ fontSize: '0.6rem', color: '#475569', letterSpacing: '0.12em' }}>{s.label}</div>
            <div className="kpi-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="r-stats-3">
        <TempoPanel
          title="SCHNELLSELLER" sub="LISTING → VERKAUF, SCHNELLSTE ZUERST"
          entries={sold} empty="Noch keine Verkäufe mit Datum."
          color={() => '#22c55e'}
          note="Gemessen vom Listing-Datum bis zum Verkaufsdatum."
        />
        <TempoPanel
          title="LADENHÜTER" sub="ONLINE, ÄLTESTE ZUERST"
          entries={listed} empty="Aktuell nichts gelistet."
          color={e => (e.d > 30 ? '#f97316' : '#64748b')}
          note="Ab 30 Tagen orange — Relist-Kandidaten."
        />
        <TempoPanel
          title="WARTENDE" sub="GEKAUFT, NOCH NICHT ONLINE"
          entries={waiting} empty="Alles online."
          color={() => '#06b6d4'}
          note="Tage seit Kaufdatum. Antizyklische Käufe bekommen ihre Zeit noch — das ist bewusst KEIN Deadstock."
        />
      </div>
    </div>
  )
}
