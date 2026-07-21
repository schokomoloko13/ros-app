import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import InventoryControls from './InventoryControls'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ITEMS_PER_PAGE = 24

const STATUS_LABEL: Record<string, string> = {
  purchased: 'Eingekauft', checked: 'Geprüft', photographed: 'Fotografiert', listed: 'Gelistet', sold: 'Verkauft',
}
const STATUS_CLASS: Record<string, string> = {
  purchased: 'status-purchased', checked: 'status-checked', photographed: 'status-photographed', listed: 'status-listed', sold: 'status-sold',
}

type SearchParams = Promise<{ q?: string; sort?: string; category?: string; status?: string; page?: string }>

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const { q = '', sort = 'newest', category = 'all', status = 'all', page = '1' } = await searchParams
  const currentPage = Math.max(1, parseInt(page) || 1)
  const offset = (currentPage - 1) * ITEMS_PER_PAGE

  let query = supabase.from('items').select('*', { count: 'exact' })

  if (q) {
    query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%,reference_number.ilike.%${q}%`)
  }
  if (category !== 'all') {
    query = query.eq('category_id', category)
  }
  if (status !== 'all') {
    query = query.eq('status', status)
  }

  switch (sort) {
    case 'oldest': query = query.order('created_at', { ascending: true }); break
    case 'ek_desc': query = query.order('purchase_price', { ascending: false }); break
    case 'ek_asc': query = query.order('purchase_price', { ascending: true }); break
    default: query = query.order('created_at', { ascending: false }); break
  }

  const { data: items, count, error } = await query.range(offset, offset + ITEMS_PER_PAGE - 1)

  if (error) {
    return (
      <div className="page-shell">
        <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>
          Fehler beim Laden: {error.message}
        </div>
      </div>
    )
  }

  const totalItems = count || 0
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE))

  // Load primary images
  const itemIds = items?.map(i => i.id) || []
  const { data: images } = itemIds.length > 0
    ? await supabase.from('item_images').select('item_id, url').in('item_id', itemIds).eq('is_primary', true)
    : { data: [] }
  const imageMap = new Map<string, string>()
  images?.forEach(img => {
    if (img.url) imageMap.set(img.item_id, img.url)
  })

  // Build pagination base params
  const baseParams = new URLSearchParams()
  if (q) baseParams.set('q', q)
  if (sort !== 'newest') baseParams.set('sort', sort)
  if (category !== 'all') baseParams.set('category', category)
  if (status !== 'all') baseParams.set('status', status)

  function getPageHref(p: number) {
    const p2 = new URLSearchParams(baseParams)
    if (p > 1) p2.set('page', String(p))
    const qs = p2.toString()
    return `/inventory${qs ? '?' + qs : ''}`
  }

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="page-head" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: 0, letterSpacing: '0.1em' }}>INVENTORY</h1>
          <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
            {totalItems} Artikel · Seite {currentPage} / {totalPages}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href="/capture"><button className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}>+ NEU</button></Link>
          <Link href="/"><button style={{ background: 'transparent', border: '1px solid #1e293b', borderRadius: '6px', color: '#475569', fontSize: '0.75rem', fontFamily: 'inherit', padding: '0.5rem 1rem', cursor: 'pointer', letterSpacing: '0.05em' }}>← COMMAND CENTER</button></Link>
        </div>
      </div>

      <InventoryControls q={q} sort={sort} category={category} status={status} />

      {/* Grid */}
      {items && items.length > 0 ? (
        <div className="card-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}>
          {items.map(item => {
            const imgUrl = imageMap.get(item.id)
            return (
              <Link
                key={item.id}
                href={`/items/${item.id}`}
                style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                <div className="panel" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}>
                  {/* Image area */}
                  <div style={{ aspectRatio: '1', background: '#0a1120', position: 'relative', overflow: 'hidden' }}>
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        loading="lazy"
                      />
                    ) : (
                      <div style={{
                        width: '100%', height: '100%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'column', color: '#334155', fontSize: '2rem',
                      }}>
                        <span>📦</span>
                        <span style={{ fontSize: '0.6rem', marginTop: '0.5rem', letterSpacing: '0.1em' }}>NO IMAGE</span>
                      </div>
                    )}
                    {/* Status badge overlay */}
                    <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                      <span className={`status-badge ${STATUS_CLASS[item.status] || 'status-purchased'}`} style={{ fontSize: '0.6rem', padding: '0.15rem 0.5rem' }}>
                        {STATUS_LABEL[item.status] || item.status}
                      </span>
                    </div>
                  </div>

                  {/* Meta */}
                  <div style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e0f2fe', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '0.25rem' }}>
                      {item.name || 'Unbenannt'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{item.brand || '—'}</span>
                      <span style={{ color: '#06b6d4', fontWeight: 700 }}>€{item.purchase_price?.toFixed(0) || '0'}</span>
                    </div>
                    {item.target_price && (
                      <div style={{ fontSize: '0.65rem', color: '#22c55e', marginTop: '0.25rem' }}>
                        → €{item.target_price.toFixed(0)}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="panel" style={{ padding: '3rem', textAlign: 'center', color: '#475569' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
          <div style={{ fontSize: '0.85rem' }}>Keine Artikel gefunden.</div>
          <div style={{ fontSize: '0.7rem', marginTop: '0.5rem' }}>Passe die Filter an oder erfasse einen neuen Artikel.</div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
          {currentPage > 1 && (
            <Link href={getPageHref(currentPage - 1)} style={{
              background: '#0a1120', border: '1px solid #1e293b', borderRadius: '6px',
              color: '#e0f2fe', fontSize: '0.75rem', fontFamily: 'inherit',
              padding: '0.5rem 1rem', textDecoration: 'none', cursor: 'pointer',
            }}>
              ← Vorherige
            </Link>
          )}
          <span style={{ fontSize: '0.75rem', color: '#475569', padding: '0 0.5rem' }}>
            Seite {currentPage} / {totalPages}
          </span>
          {currentPage < totalPages && (
            <Link href={getPageHref(currentPage + 1)} style={{
              background: '#0a1120', border: '1px solid #1e293b', borderRadius: '6px',
              color: '#e0f2fe', fontSize: '0.75rem', fontFamily: 'inherit',
              padding: '0.5rem 1rem', textDecoration: 'none', cursor: 'pointer',
            }}>
              Nächste →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
