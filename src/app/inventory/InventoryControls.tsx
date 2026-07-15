'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

const CATEGORIES = [
  { value: 'all', label: 'Alle' },
  { value: 'watches', label: '⌚ Uhren' },
  { value: 'clothing', label: '👕 Kleidung' },
  { value: 'vintage', label: '🎭 Vintage' },
  { value: 'shoes', label: '👟 Schuhe' },
  { value: 'bags', label: '👜 Taschen' },
  { value: 'electronics', label: '📱 Elektronik' },
]

const STATUSES = [
  { value: 'all', label: 'Alle Status' },
  { value: 'purchased', label: 'Eingekauft' },
  { value: 'checked', label: 'Geprüft' },
  { value: 'photographed', label: 'Fotografiert' },
  { value: 'listed', label: 'Gelistet' },
  { value: 'sold', label: 'Verkauft' },
]

const SORTS = [
  { value: 'newest', label: 'Neueste ▼' },
  { value: 'oldest', label: 'Älteste ▲' },
  { value: 'ek_desc', label: 'Höchster EK ▼' },
  { value: 'ek_asc', label: 'Niedrigster EK ▲' },
]

export default function InventoryControls({
  q,
  sort,
  category,
  status,
}: {
  q: string
  sort: string
  category: string
  status: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [searchValue, setSearchValue] = useState(q)
  const [isPending, startTransition] = useTransition()

  function update(key: string, value: string) {
    const p = new URLSearchParams(params.toString())
    if (value && value !== 'all' && value !== 'newest') {
      p.set(key, value)
    } else {
      p.delete(key)
    }
    if (key !== 'page') p.delete('page')
    startTransition(() => {
      router.push(`/inventory?${p.toString()}`)
    })
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      update('q', searchValue)
    }
  }

  function clearFilters() {
    startTransition(() => {
      router.push('/inventory')
    })
  }

  const hasFilters = q || category !== 'all' || status !== 'all' || sort !== 'newest'

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      {/* Top row: Search + Sort */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <input
            type="text"
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Suche nach Name, Marke, Ref…"
            className="form-input"
            style={{ paddingLeft: '2.2rem' }}
          />
          <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#334155', fontSize: '0.85rem' }}>🔍</span>
        </div>

        <select
          value={sort}
          onChange={e => update('sort', e.target.value)}
          className="form-input"
          style={{ width: 'auto', minWidth: '150px' }}
        >
          {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={category}
          onChange={e => update('category', e.target.value)}
          className="form-input"
          style={{ width: 'auto', fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
        >
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        <select
          value={status}
          onChange={e => update('status', e.target.value)}
          className="form-input"
          style={{ width: 'auto', fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
        >
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{
              background: 'transparent',
              border: '1px solid #1e293b',
              borderRadius: '6px',
              color: '#475569',
              fontSize: '0.7rem',
              fontFamily: 'inherit',
              padding: '0.4rem 0.75rem',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            ✕ Filter zurücksetzen
          </button>
        )}

        {isPending && (
          <span style={{ fontSize: '0.65rem', color: '#06b6d4', marginLeft: 'auto' }}>
            Lädt…
          </span>
        )}
      </div>
    </div>
  )
}
