import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { Suspense } from 'react'
import FilterBar from './FilterBar'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export const revalidate = 0

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1)
  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '20px', marginTop: '8px' }}>
      {data.map((val, i) => (
        <div key={i} style={{
          width: '5px',
          height: `${Math.max(2, (val / max) * 20)}px`,
          background: color, borderRadius: '1px', opacity: 0.85,
        }} />
      ))}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, sparkData, sparkColor }: {
  label: string; value: string; sub?: string; sparkData: number[]; sparkColor: string
}) {
  return (
    <div className="kpi-card">
      <div style={{ fontSize: '0.65rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && (
        <div style={{ fontSize: '0.7rem', marginTop: '2px', color: sparkColor === '#ef4444' ? '#ef4444' : sparkColor === '#22c55e' ? '#22c55e' : '#64748b' }}>
          {sub}
        </div>
      )}
      <Sparkline data={sparkData} color={sparkColor} />
    </div>
  )
}

// ─── Alert Badge ──────────────────────────────────────────────────────────────
function AlertBadge({ type }: { type: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    overdue:    { bg: 'rgba(239,68,68,0.15)',   color: '#ef4444', label: 'OVERDUE' },
    urgent:     { bg: 'rgba(249,115,22,0.15)',  color: '#f97316', label: 'URGENT' },
    '2d left':  { bg: 'rgba(234,179,8,0.15)',   color: '#facc15', label: '2D LEFT' },
    'ai ready': { bg: 'rgba(168,85,247,0.15)',  color: '#c084fc', label: 'AI READY' },
    alert:      { bg: 'rgba(249,115,22,0.15)',  color: '#f97316', label: 'ALERT' },
    ready:      { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80', label: 'READY' },
    photo:      { bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa', label: 'PHOTO NEEDED' },
    relist:     { bg: 'rgba(6,182,212,0.15)',   color: '#06b6d4', label: 'RELIST NEEDED' },
  }
  const s = styles[type] || styles.alert
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '0.15rem 0.5rem', borderRadius: '4px',
      fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em',
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>{s.label}</span>
  )
}

// ─── Platform Node ────────────────────────────────────────────────────────────
function PlatformNode({ name, platform, chats, views, listed, online }: {
  name: string; platform: 'ka' | 'vinted'; chats: number; views: number; listed: number; online: boolean
}) {
  const accentColor = platform === 'ka' ? '#f97316' : '#22c55e'
  const platformLabel = platform === 'ka' ? 'Kleinanzeigen' : 'Vinted'

  return (
    <div
      className="platform-node"
      style={{ border: `1px solid ${online ? '#1e293b' : '#0f172a'}` }}
    >
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
        background: online ? accentColor : '#1e293b',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.65rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '2px' }}>
            {platformLabel}
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e0f2fe' }}>{name}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <div
            className={online ? 'dot-online' : ''}
            style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: online ? '#22c55e' : '#334155',
              color: '#22c55e',
            }}
          />
          <span style={{ fontSize: '0.65rem', color: online ? '#22c55e' : '#334155', letterSpacing: '0.06em' }}>
            {online ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
        {[
          { label: 'Chats',  value: chats,  color: chats > 0 ? '#f97316' : '#334155' },
          { label: 'Views',  value: views,  color: '#06b6d4' },
          { label: 'Listed', value: listed, color: '#475569' },
        ].map(m => (
          <div key={m.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: m.color, lineHeight: 1 }}>{m.value}</div>
            <div style={{ fontSize: '0.6rem', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '3px' }}>{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  purchased: 'Eingekauft', checked: 'Geprüft', photographed: 'Fotografiert', listed: 'Gelistet', sold: 'Verkauft',
}
const STATUS_CLASS: Record<string, string> = {
  purchased: 'status-purchased', checked: 'status-checked', photographed: 'status-photographed', listed: 'status-listed', sold: 'status-sold',
}
const CATEGORY_ICON: Record<string, string> = {
  watches: '⌚', clothing: '👕', vintage: '🎭', shoes: '👟', bags: '👜', electronics: '📱',
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

type SearchParams = Promise<{ filter?: string; sort?: string }>

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const { filter = 'all', sort = 'newest' } = await searchParams

  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  let itemsQuery = supabase.from('items').select('*')
  switch (filter) {
    case 'watches':  itemsQuery = itemsQuery.eq('category_id', 'watches'); break
    case 'clothing': itemsQuery = itemsQuery.eq('category_id', 'clothing'); break
    case 'vintage':  itemsQuery = itemsQuery.eq('category_id', 'vintage'); break
    case 'unlisted': itemsQuery = itemsQuery.eq('status', 'purchased'); break
    case 'live':     itemsQuery = itemsQuery.eq('status', 'listed'); break
    case 'photo':    itemsQuery = itemsQuery.eq('status', 'checked'); break
    case 'dead':     itemsQuery = itemsQuery.eq('status', 'purchased'); break
  }
  switch (sort) {
    case 'oldest':  itemsQuery = itemsQuery.order('created_at', { ascending: true }); break
    case 'ek_desc': itemsQuery = itemsQuery.order('purchase_price', { ascending: false }); break
    case 'ek_asc':  itemsQuery = itemsQuery.order('purchase_price', { ascending: true }); break
    default:        itemsQuery = itemsQuery.order('created_at', { ascending: false }); break
  }

  const [
    { data: items },
    { count: totalItems },
    { data: inventoryAll },
    { data: soldThisMonth },
    { data: revenueHistory },
    { count: deadStock },
    { data: soldAll },
    { data: alertItems },
    { count: listedCount },
  ] = await Promise.all([
    itemsQuery.limit(8),
    supabase.from('items').select('*', { count: 'exact', head: true }),
    supabase.from('items').select('purchase_price').not('purchase_price', 'is', null),
    supabase.from('items').select('target_price').eq('status', 'sold').gte('created_at', firstOfMonth),
    supabase.from('items').select('target_price').eq('status', 'sold').order('created_at', { ascending: true }).limit(7),
    supabase.from('items').select('*', { count: 'exact', head: true }).eq('status', 'purchased'),
    supabase.from('items').select('target_price, purchase_price').eq('status', 'sold'),
    supabase.from('items').select('id, name, status, created_at, listed_at').order('created_at', { ascending: true }).limit(20),
    supabase.from('items').select('*', { count: 'exact', head: true }).eq('status', 'listed'),
  ])

  // ─── Load primary images for recent items ─────────────────────────────────
  const itemIds = items?.map(i => i.id) || []
  const { data: images } = itemIds.length > 0
    ? await supabase
        .from('item_images')
        .select('item_id, url, is_primary')
        .in('item_id', itemIds)
        .eq('is_primary', true)
    : { data: [] }

  const imageMap = new Map<string, string>()
  images?.forEach(img => {
    if (img.url) imageMap.set(img.item_id, img.url)
  })
  // ─── End image loading ────────────────────────────────────────────────────

  const inventoryValue = inventoryAll?.reduce((s, i) => s + (i.purchase_price || 0), 0) || 0
  const revenueMonth   = soldThisMonth?.reduce((s, i) => s + (i.target_price   || 0), 0) || 0
  const totalRevenue   = soldAll?.reduce((s, i) => s + (i.target_price   || 0), 0) || 0
  const totalCogs      = soldAll?.reduce((s, i) => s + (i.purchase_price || 0), 0) || 0
  const netMargin      = totalRevenue > 0 ? Math.round(((totalRevenue - totalCogs) / totalRevenue) * 100) : 0
  const stockRunway    = inventoryValue > 0 && revenueMonth > 0 ? (inventoryValue / revenueMonth).toFixed(1) : '—'

  const pad7 = (arr: number[]) => arr.length < 7 ? [...Array(7 - arr.length).fill(0), ...arr] : arr.slice(-7)
  const revSparkPadded = pad7((revenueHistory || []).map(r => r.target_price || 0))
  const fmt = (n: number) => n.toLocaleString('de-DE')

  const alerts = (alertItems || []).map(item => {
    const days = daysSince(item.created_at)
    let type = 'alert', msg = item.name || 'Unbenannt'
    if      (item.status === 'purchased'    && days > 14) { type = 'overdue';  msg += ` · ${days}d unlisted` }
    else if (item.status === 'purchased'    && days > 7)  { type = 'urgent';   msg += ` · ${days}d unlisted` }
    else if (item.status === 'checked')                   { type = 'photo';    msg += ' · needs photo shoot' }
    else if (item.status === 'photographed')              { type = 'ai ready'; msg += ' · ready to list' }
    else if (item.status === 'listed') {
      const listedDays = item.listed_at ? daysSince(item.listed_at) : days
      if (listedDays > 30) { type = 'relist'; msg += ` · ${listedDays}d listed, relist!` }
      else                 { type = 'ready';  msg += ' · live on platform' }
    }
    else                                                  { type = 'alert';    msg += ' · check status' }
    return { id: item.id, type, msg }
  }).slice(0, 10)

  const listed = listedCount || 0
  const platformNodes = [
    { name: 'KA Account 01', platform: 'ka' as const,     chats: 0, views: 0, listed: Math.floor(listed * 0.4), online: true },
    { name: 'KA Account 02', platform: 'ka' as const,     chats: 0, views: 0, listed: Math.floor(listed * 0.3), online: true },
    { name: 'KA Account 03', platform: 'ka' as const,     chats: 0, views: 0, listed: Math.floor(listed * 0.2), online: false },
    { name: 'Vinted',        platform: 'vinted' as const, chats: 0, views: 0, listed: Math.floor(listed * 0.1), online: true },
  ]

  const kpis = [
    { label: 'Revenue Month',   value: `€${fmt(revenueMonth)}`,   sub: revenueMonth > 0 ? `+€${fmt(revenueMonth)} this mo` : 'no sales yet', sparkData: revSparkPadded, sparkColor: '#22c55e' },
    { label: 'Net Margin',      value: `${netMargin}%`,            sub: netMargin >= 30 ? '▲ healthy' : netMargin > 0 ? '~ ok' : 'no data',   sparkData: pad7([netMargin]), sparkColor: netMargin >= 30 ? '#22c55e' : netMargin > 0 ? '#06b6d4' : '#ef4444' },
    { label: 'Inventory Value', value: `€${fmt(inventoryValue)}`,  sub: `${totalItems || 0} items`, sparkData: pad7((inventoryAll || []).slice(-7).map(i => i.purchase_price || 0)), sparkColor: '#06b6d4' },
    { label: 'Stock Runway',    value: `${stockRunway} mo`,        sub: 'at current burn', sparkData: [3,4,3,5,4,4,3], sparkColor: '#06b6d4' },
    { label: 'Dead Stock',      value: String(deadStock || 0),     sub: (deadStock||0) > 5 ? '▲ needs action' : 'ok', sparkData: pad7([deadStock||0]), sparkColor: (deadStock||0) > 5 ? '#ef4444' : '#22c55e' },
    { label: 'Open Chats',      value: '—',                        sub: 'no platform data', sparkData: [1,2,1,3,2,1,0], sparkColor: '#06b6d4' },
  ]

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: 0, letterSpacing: '0.1em' }}>R.O.S. COMMAND CENTER</h1>
          <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>Resale Operating System v0.1.0</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href="/inventory" style={{
            background: 'transparent',
            border: '1px solid #1e293b',
            borderRadius: '6px',
            color: '#475569',
            fontSize: '0.75rem',
            fontFamily: 'inherit',
            fontWeight: 600,
            letterSpacing: '0.05em',
            padding: '0.6rem 1.2rem',
            cursor: 'pointer',
            textTransform: 'uppercase',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
          }}>
            📦 INVENTORY
          </Link>
          <Link href="/capture"><button className="btn-primary">+ NEUER EINKAUF</button></Link>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {kpis.map(kpi => <KpiCard key={kpi.label} {...kpi} />)}
      </div>

      {/* Filter Bar */}
      <Suspense fallback={<div style={{ height: '36px' }} />}>
        <FilterBar />
      </Suspense>

      {/* Main 2-col layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1rem', marginBottom: '1.25rem' }}>

        {/* LEFT: Recent Items */}
        <div className="panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '0.85rem', letterSpacing: '0.08em' }}>
              RECENT ITEMS <span style={{ color: '#1e293b' }}>//</span>{' '}
              <span style={{ color: '#475569', textShadow: 'none' }}>WITH IMAGES</span>
            </h2>
            <Link href="/inventory" style={{ color: '#06b6d4', fontSize: '0.75rem' }}>All items →</Link>
          </div>

          {items && items.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {items.map(item => {
                const days = daysSince(item.created_at)
                const icon = CATEGORY_ICON[item.category_id] || '📦'
                const initials = (item.name || '?').slice(0, 2).toUpperCase()
                const primaryImage = imageMap.get(item.id)
                return (
                  <div key={item.id} className="item-row">
                    {/* Thumbnail: real image or placeholder */}
                    <div style={{
                      width: '48px', height: '48px', borderRadius: '6px',
                      overflow: 'hidden',
                      border: '1px solid #1e293b',
                      flexShrink: 0,
                      background: '#0a1120',
                    }}>
                      {primaryImage ? (
                        <img
                          src={primaryImage}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          loading="lazy"
                        />
                      ) : (
                        <div style={{
                          width: '100%', height: '100%',
                          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          fontSize: '1.1rem',
                        }}>
                          <span>{icon}</span>
                          <span style={{ fontSize: '0.5rem', color: '#475569', letterSpacing: '0.05em' }}>{initials}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#e0f2fe', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.name || 'Unbenannt'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '2px', display: 'flex', gap: '0.5rem' }}>
                        {item.zone_id && <span style={{ background: '#0f172a', border: '1px solid #1e293b', padding: '0 0.4rem', borderRadius: '3px' }}>{item.zone_id}</span>}
                        <span>EK €{item.purchase_price?.toFixed(0) || '0'}</span>
                        <span style={{ color: '#22c55e' }}>→ €{item.target_price?.toFixed(0) || '0'}</span>
                        <span style={{ color: '#334155' }}>· {days}d ago</span>
                      </div>
                    </div>
                    <span className={`status-badge ${STATUS_CLASS[item.status] || 'status-purchased'}`}>
                      {STATUS_LABEL[item.status] || item.status}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#475569', padding: '3rem 0', fontSize: '0.85rem' }}>
              {filter === 'all' ? 'Noch keine Artikel. Klicke auf „+ NEUER EINKAUF".' : `Keine Artikel für Filter „${filter}".`}
            </div>
          )}
        </div>

        {/* RIGHT: Alerts */}
        <div className="panel" style={{ padding: '1.25rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
            ALERTS <span style={{ color: '#1e293b' }}>//</span>{' '}
            <span style={{ color: '#475569', textShadow: 'none' }}>ACTION REQUIRED</span>
          </h2>
          {alerts.length > 0 ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {alerts.map(a => (
                  <div key={a.id} className="alert-row">
                    <AlertBadge type={a.type} />
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.4 }}>{a.msg}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #1e293b', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {(['overdue','urgent','photo','ai ready','ready','relist'] as const).map(type => {
                  const count = alerts.filter(a => a.type === type).length
                  if (!count) return null
                  return (
                    <span key={type} style={{ fontSize: '0.65rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertBadge type={type} /> ×{count}
                    </span>
                  )
                })}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: '#475569', padding: '3rem 0', fontSize: '0.85rem' }}>
              No alerts. Add items to see action items.
            </div>
          )}
        </div>
      </div>

      {/* Platform Matrix */}
      <div className="panel" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '0.85rem', letterSpacing: '0.08em' }}>
            PLATFORM MATRIX <span style={{ color: '#1e293b' }}>//</span>{' '}
            <span style={{ color: '#475569', textShadow: 'none' }}>4 NODES</span>
          </h2>
          <span style={{ fontSize: '0.65rem', color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {platformNodes.filter(n => n.online).length}/{platformNodes.length} online
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
          {platformNodes.map(node => <PlatformNode key={node.name} {...node} />)}
        </div>
      </div>
    </div>
  )
}
