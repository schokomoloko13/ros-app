import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

// M4 — PLATTFORM-MATRIX: welcher Artikel ist wo live?
// Datenquelle: platform_listings (wird von der Extension per M3.5-Writeback befüllt)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export const dynamic = 'force-dynamic' // immer frische Daten, kein Build-Cache

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  kleinanzeigen: { label: 'KA', color: '#06b6d4' },
  vinted:        { label: 'VINTED', color: '#c084fc' },
}

const STATUS_LABEL: Record<string, string> = {
  purchased: 'Eingekauft', checked: 'Geprüft', photographed: 'Fotografiert', listed: 'Gelistet', sold: 'Verkauft',
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('de-DE')
}

function platformBadge(listing: any, meta: { label: string; color: string }) {
  const days = daysSince(listing.listed_at)
  const relist = days > 30
  const inner = (
    <>
      <span style={{ color: meta.color, fontWeight: 700 }}>● {meta.label}</span>{' '}
      <span style={{ color: relist ? '#f97316' : '#64748b' }}>
        {fmtDate(listing.listed_at)} · {days}d{relist ? ' 🔄' : ''}
      </span>
    </>
  )
  if (listing.listing_url) {
    return (
      <a href={listing.listing_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
        {inner}
      </a>
    )
  }
  return <span>{inner}</span>
}

const GRID = 'minmax(220px, 1fr) 170px 170px 90px'

function ItemRow({ item, platforms }: { item: any; platforms: Record<string, any> }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: GRID, gap: '1rem', alignItems: 'center',
      padding: '0.6rem 1rem', borderBottom: '1px solid #0f172a', fontSize: '0.8rem',
    }}>
      <div>
        <Link href={`/items/${item.id}`} style={{ color: '#e0f2fe', textDecoration: 'none', fontWeight: 600 }}>
          {item.name || 'Unbenannt'}
        </Link>
        {item.brand && <span style={{ color: '#475569' }}> · {item.brand}</span>}
      </div>
      {(['kleinanzeigen', 'vinted'] as const).map(p => (
        <div key={p}>
          {platforms[p]
            ? platformBadge(platforms[p], PLATFORM_META[p])
            : <span style={{ color: '#1e293b' }}>—</span>}
        </div>
      ))}
      <div style={{ color: item.target_price ? '#22c55e' : '#334155', textAlign: 'right' }}>
        {item.target_price ? `€${Number(item.target_price).toFixed(0)}` : '—'}
      </div>
    </div>
  )
}

function MatrixTable({ items, byItem }: { items: any[]; byItem: Record<string, Record<string, any>> }) {
  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: GRID, gap: '1rem',
        padding: '0.5rem 1rem', fontSize: '0.6rem', color: '#475569',
        textTransform: 'uppercase', letterSpacing: '0.12em', borderBottom: '1px solid #1e293b',
      }}>
        <div>Artikel</div>
        <div style={{ color: PLATFORM_META.kleinanzeigen.color }}>Kleinanzeigen</div>
        <div style={{ color: PLATFORM_META.vinted.color }}>Vinted</div>
        <div style={{ textAlign: 'right' }}>Preis</div>
      </div>
      {items.map(it => <ItemRow key={it.id} item={it} platforms={byItem[it.id] || {}} />)}
    </div>
  )
}

export default async function MatrixPage() {
  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('id, name, brand, status, target_price, listed_at, created_at')
    .order('created_at', { ascending: false })

  const { data: listings, error: listingsError } = await supabase
    .from('platform_listings')
    .select('item_id, platform, status, listed_at, listing_url')

  // Ohne diese Prüfung sieht ein fehlgeschlagener Query exakt aus wie
  // "keine Daten vorhanden" — stumm leere Seite statt Fehlermeldung.
  const loadError = itemsError || listingsError

  const byItem: Record<string, Record<string, any>> = {}
  for (const l of listings || []) {
    if (!byItem[l.item_id]) byItem[l.item_id] = {}
    byItem[l.item_id][l.platform] = l
  }

  const all = items || []
  const live      = all.filter(it => byItem[it.id] && it.status !== 'sold')
  const ready     = all.filter(it => !byItem[it.id] && it.status === 'photographed')
  const inWork    = all.filter(it => !byItem[it.id] && it.status !== 'photographed' && it.status !== 'sold')
  const sold      = all.filter(it => it.status === 'sold')

  const maxDays = (it: any) =>
    Math.max(0, ...Object.values(byItem[it.id] || {}).map((l: any) => daysSince(l.listed_at)))
  live.sort((a, b) => maxDays(b) - maxDays(a)) // älteste (Relist-Kandidaten) oben

  const relistCount = live.filter(it => maxDays(it) > 30).length
  const kaCount     = live.filter(it => byItem[it.id]?.kleinanzeigen).length
  const vintedCount = live.filter(it => byItem[it.id]?.vinted).length

  const stats = [
    { label: 'Live auf KA',     value: kaCount,     color: PLATFORM_META.kleinanzeigen.color },
    { label: 'Live auf Vinted', value: vintedCount, color: PLATFORM_META.vinted.color },
    { label: 'Relist fällig',   value: relistCount, color: relistCount ? '#f97316' : '#475569' },
    { label: 'Bereit (fotografiert)', value: ready.length, color: '#22c55e' },
  ]

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Link href="/" style={{ color: '#475569', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          ← COMMAND CENTER
        </Link>
        <span style={{ color: '#1e293b' }}>/</span>
        <Link href="/inventory" style={{ color: '#475569', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          INVENTORY
        </Link>
        <span style={{ color: '#1e293b' }}>/</span>
        <span style={{ color: '#06b6d4', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          MATRIX
        </span>
      </div>

      <h1 style={{ fontSize: '1.5rem', margin: '0 0 1.5rem', letterSpacing: '0.05em', color: '#e0f2fe' }}>
        PLATTFORM-MATRIX
      </h1>

      {loadError && (
        <div className="panel" style={{
          padding: '1rem 1.25rem', marginBottom: '1.5rem',
          border: '1px solid rgba(249,115,22,0.5)', color: '#fdba74', fontSize: '0.8rem',
        }}>
          <strong>Daten konnten nicht geladen werden.</strong>{' '}
          <span style={{ color: '#94a3b8' }}>{loadError.message}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {stats.map(s => (
          <div key={s.label} className="panel" style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.35rem' }}>
              {s.label}
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
          LIVE <span style={{ color: '#1e293b' }}>//</span>{' '}
          <span style={{ color: '#475569' }}>{live.length} ARTIKEL · ÄLTESTE OBEN · 🔄 = RELIST (&gt;30d)</span>
        </h2>
        {live.length
          ? <MatrixTable items={live} byItem={byItem} />
          : <div style={{ color: '#475569', fontSize: '0.8rem' }}>
              Noch nichts live. Poste einen Artikel per Button aus der Artikelseite — nach dem Veröffentlichen trägt die Extension ihn hier ein.
            </div>}
      </div>

      {ready.length > 0 && (
        <div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem', border: '1px solid rgba(34,197,94,0.35)' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
            BEREIT ZUM POSTEN <span style={{ color: '#1e293b' }}>//</span>{' '}
            <span style={{ color: '#475569' }}>FOTOGRAFIERT, NIRGENDS LIVE</span>
          </h2>
          <MatrixTable items={ready} byItem={byItem} />
        </div>
      )}

      {inWork.length > 0 && (
        <div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
            IN ARBEIT <span style={{ color: '#1e293b' }}>//</span>{' '}
            <span style={{ color: '#475569' }}>NOCH NICHT FOTOGRAFIERT</span>
          </h2>
          <MatrixTable items={inWork} byItem={byItem} />
        </div>
      )}

      {sold.length > 0 && (
        <div className="panel" style={{ padding: '1.25rem', opacity: 0.6 }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
            VERKAUFT <span style={{ color: '#1e293b' }}>//</span>{' '}
            <span style={{ color: '#475569' }}>{sold.length}</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem' }}>
            {sold.map(it => {
              const plats = Object.keys(byItem[it.id] || {})
                .map(p => PLATFORM_META[p]?.label || p.toUpperCase()).join(' + ')
              return (
                <div key={it.id} style={{ display: 'flex', gap: '0.75rem' }}>
                  <Link href={`/items/${it.id}`} style={{ color: '#94a3b8', textDecoration: 'none' }}>
                    {it.name || 'Unbenannt'}
                  </Link>
                  <span style={{ color: '#475569' }}>{plats ? `(war live: ${plats})` : ''}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
