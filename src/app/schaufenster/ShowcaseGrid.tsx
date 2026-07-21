'use client'

import { useMemo, useState } from 'react'

type ShowcaseItem = {
  id: string
  name: string | null
  brand: string | null
  reference_number: string | null
  year: number | null
  color: string | null
  size: string | null
  diameter_mm: number | null
  material: string | null
  movement: string | null
  condition_score: number | null
  target_price: number | null
  category_name: string | null
  images: string[]
}

const priceFmt = (n: number | null) =>
  n != null
    ? `€${Number(n).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : 'Auf Anfrage'

const chipStyle = (on: boolean): React.CSSProperties => ({
  padding: '0.3rem 0.7rem',
  borderRadius: '999px',
  fontSize: '0.65rem',
  fontWeight: 600,
  letterSpacing: '0.03em',
  border: on ? '1px solid #06b6d4' : '1px solid #1e293b',
  background: on ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
  color: on ? '#06b6d4' : '#64748b',
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
})

type SortKey = 'neu' | 'auf' | 'ab'

export default function ShowcaseGrid({ items }: { items: ShowcaseItem[] }) {
  const [active, setActive] = useState<ShowcaseItem | null>(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [brand, setBrand] = useState('')
  const [sort, setSort] = useState<SortKey>('neu')

  const cats = useMemo(
    () => [...new Set(items.map(i => i.category_name).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'de')),
    [items]
  )
  const brands = useMemo(
    () => [...new Set(items.map(i => i.brand).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'de')),
    [items]
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = items.filter(i => {
      if (cat && i.category_name !== cat) return false
      if (brand && i.brand !== brand) return false
      if (needle) {
        const hay = `${i.name ?? ''} ${i.brand ?? ''} ${i.reference_number ?? ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
    if (sort === 'auf' || sort === 'ab') {
      const dir = sort === 'auf' ? 1 : -1
      list = [...list].sort((a, b) => {
        const pa = a.target_price ?? Number.POSITIVE_INFINITY
        const pb = b.target_price ?? Number.POSITIVE_INFINITY
        return (pa - pb) * dir
      })
    }
    return list
  }, [items, q, cat, brand, sort])

  const specs = (i: ShowcaseItem) =>
    [
      i.brand && `Marke: ${i.brand}`,
      i.reference_number && `Referenz: ${i.reference_number}`,
      i.year && `Baujahr: ${i.year}`,
      i.condition_score && `Zustand: ${i.condition_score}/10`,
      i.color && `Farbe: ${i.color}`,
      i.diameter_mm && `Ø ${i.diameter_mm} mm`,
      i.size && `Größe: ${i.size}`,
      i.material && `Material: ${i.material}`,
      i.movement && `Uhrwerk: ${i.movement}`,
    ].filter(Boolean) as string[]

  return (
    <>
      {/* ── Filter ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            style={{ flex: '1 1 220px', width: 'auto' }}
            placeholder="Suche: Name, Marke, Referenz …"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <select
            className="form-input"
            style={{ flex: '0 1 auto', width: 'auto' }}
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            aria-label="Sortierung"
          >
            <option value="neu">Neueste zuerst</option>
            <option value="auf">Preis aufsteigend</option>
            <option value="ab">Preis absteigend</option>
          </select>
        </div>

        {cats.length > 0 && (
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            <button style={chipStyle(cat === '')} onClick={() => setCat('')}>ALLE</button>
            {cats.map(c => (
              <button key={c} style={chipStyle(cat === c)} onClick={() => setCat(cat === c ? '' : c)}>
                {c.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {brands.length > 1 && (
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            <button style={chipStyle(brand === '')} onClick={() => setBrand('')}>ALLE MARKEN</button>
            {brands.map(b => (
              <button key={b} style={chipStyle(brand === b)} onClick={() => setBrand(brand === b ? '' : b)}>
                {b.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        <div style={{ fontSize: '0.65rem', color: '#475569' }}>
          {filtered.length === items.length
            ? `${items.length} Artikel`
            : `${filtered.length} von ${items.length} Artikeln`}
        </div>
      </div>

      {/* ── Grid ───────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{ color: '#475569', fontSize: '0.85rem', padding: '2rem 0' }}>
          Nichts gefunden — Filter zurücksetzen?
        </div>
      ) : (
        <div className="sf-grid">
          {filtered.map(i => (
            <button
              key={i.id}
              onClick={() => setActive(i)}
              style={{
                background: '#0a1220',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                padding: 0,
                overflow: 'hidden',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ aspectRatio: '1', background: '#050a14', overflow: 'hidden' }}>
                {i.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.images[0]} alt={i.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e293b', fontSize: '1.5rem' }}>◌</div>
                )}
              </div>
              <div style={{ padding: '0.6rem 0.75rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e0f2fe', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {i.name || 'Unbenannt'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                  <span style={{ fontSize: '0.65rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.brand || ''}{i.year ? ` · ${i.year}` : ''}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#22c55e', flexShrink: 0, marginLeft: '0.5rem' }}>
                    {priceFmt(i.target_price)}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Detail-Modal ───────────────────────────────────────── */}
      {active && (
        <div
          onClick={() => setActive(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(2,6,17,0.9)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0a1220', border: '1px solid #1e293b', borderRadius: '10px',
              maxWidth: '560px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid #1e293b' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e0f2fe' }}>{active.name || 'Unbenannt'}</div>
              <button
                onClick={() => setActive(null)}
                style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '1.1rem', cursor: 'pointer', padding: '0.25rem' }}
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>

            {active.images.length > 0 && (
              <div style={{
                display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0.75rem 1rem',
                scrollSnapType: 'x mandatory',
              }}>
                {active.images.map((url, k) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={k}
                    src={url}
                    alt=""
                    style={{
                      height: '260px', borderRadius: '6px', scrollSnapAlign: 'start',
                      flexShrink: 0, objectFit: 'cover',
                    }}
                  />
                ))}
              </div>
            )}

            <div style={{ padding: '0.5rem 1rem 1rem' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#22c55e', margin: '0.25rem 0 0.75rem' }}>
                {priceFmt(active.target_price)}
              </div>
              {specs(active).map(s => (
                <div key={s} style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '0.2rem 0', borderBottom: '1px solid #0f172a' }}>
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
