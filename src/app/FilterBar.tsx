'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const FILTERS = [
  { label: 'All',          value: 'all' },
  { label: 'Watches',      value: 'watches' },
  { label: 'Clothing',     value: 'clothing' },
  { label: 'Vintage',      value: 'vintage' },
  { label: 'Unlisted',     value: 'unlisted' },
  { label: 'Live',         value: 'live' },
  { label: 'Photo needed', value: 'photo' },
  { label: 'Dead stock',   value: 'dead' },
]

const SORTS = [
  { label: 'Newest ▼',     value: 'newest' },
  { label: 'Oldest ▲',     value: 'oldest' },
  { label: 'Highest EK ▼', value: 'ek_desc' },
  { label: 'Lowest EK ▲',  value: 'ek_asc' },
]

export default function FilterBar() {
  const router = useRouter()
  const params = useSearchParams()
  const active = params.get('filter') || 'all'
  const sort   = params.get('sort')   || 'newest'

  const set = (key: string, val: string) => {
    const p = new URLSearchParams(params.toString())
    p.set(key, val)
    if (key === 'filter' && val === 'all') p.delete('filter')
    if (key === 'sort'   && val === 'newest') p.delete('sort')
    router.push(`/?${p.toString()}`)
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '0.75rem',
      marginBottom: '1.25rem',
      flexWrap: 'wrap',
    }}>
      {/* Chips */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const isActive = f.value === active
          return (
            <button
              key={f.value}
              onClick={() => set('filter', f.value)}
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '9999px',
                border: `1px solid ${isActive ? '#06b6d4' : '#1e293b'}`,
                background: isActive ? 'rgba(6,182,212,0.15)' : 'transparent',
                color: isActive ? '#06b6d4' : '#475569',
                fontSize: '0.72rem',
                fontFamily: 'inherit',
                cursor: 'pointer',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                boxShadow: isActive ? '0 0 8px rgba(6,182,212,0.25)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Sort dropdown */}
      <select
        value={sort}
        onChange={e => set('sort', e.target.value)}
        style={{
          background: '#0a1120',
          border: '1px solid #1e293b',
          color: '#94a3b8',
          fontSize: '0.72rem',
          fontFamily: 'inherit',
          padding: '0.3rem 0.6rem',
          borderRadius: '6px',
          cursor: 'pointer',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          outline: 'none',
        }}
      >
        {SORTS.map(s => (
          <option key={s.value} value={s.value} style={{ background: '#0a1120' }}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  )
}
