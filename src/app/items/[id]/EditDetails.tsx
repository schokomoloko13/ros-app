'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Option = { id: string; name: string }

type FieldDef = {
  key: string
  label: string
  type: 'text' | 'number'
  step?: string
  euro?: boolean
  suffix?: string
  color?: string
}

const FIELDS: FieldDef[] = [
  { key: 'name',             label: 'Name',          type: 'text' },
  { key: 'purchase_price',   label: 'Einkaufspreis', type: 'number', step: '0.01', euro: true, color: '#06b6d4' },
  { key: 'target_price',     label: 'Wunschpreis',   type: 'number', step: '0.01', euro: true, color: '#22c55e' },
  { key: 'min_price',        label: 'Minimalpreis',  type: 'number', step: '0.01', euro: true, color: '#f97316' },
  { key: 'brand',            label: 'Marke',         type: 'text' },
  { key: 'reference_number', label: 'Referenz',      type: 'text' },
  { key: 'year',             label: 'Baujahr',       type: 'number', step: '1' },
  { key: 'color',            label: 'Farbe',         type: 'text' },
  { key: 'size',             label: 'Größe',         type: 'text' },
  { key: 'diameter_mm',      label: 'Ø mm',          type: 'number', step: '1', suffix: 'mm' },
  { key: 'material',         label: 'Material',      type: 'text' },
  { key: 'movement',         label: 'Uhrwerk',       type: 'text' },
  { key: 'condition_score',  label: 'Zustand',       type: 'number', step: '1', suffix: '/10' },
]

const SELECTS = [
  { key: 'category_id', label: 'Kategorie' },
  { key: 'source_id',   label: 'Quelle' },
  { key: 'zone_id',     label: 'Zone' },
] as const

const inputStyle = {
  width: '100%',
  background: '#0a1220',
  border: '1px solid #334155',
  borderRadius: '4px',
  padding: '0.35rem 0.5rem',
  color: '#e0f2fe',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box' as const,
}

const btnBase = {
  fontFamily: 'monospace',
  fontSize: '0.65rem',
  letterSpacing: '0.08em',
  padding: '0.3rem 0.75rem',
  borderRadius: '4px',
  cursor: 'pointer',
} as const

function fmtValue(f: FieldDef, value: any): string {
  if (value == null || value === '') return '—'
  if (f.euro)   return `€${Number(value).toFixed(2)}`
  if (f.suffix === 'mm')  return `${value}mm`
  if (f.suffix === '/10') return `${value}/10`
  return String(value)
}

export default function EditDetails({
  item,
  categories,
  sources,
  zones,
}: {
  item: any
  categories: Option[]
  sources: Option[]
  zones: Option[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [form, setForm]       = useState<Record<string, any>>({})

  const computed = [
    { label: 'Nettogewinn',  value: item.net_profit    ? `€${item.net_profit.toFixed(2)}`    : '—', color: '#22c55e' },
    { label: 'Marge',        value: item.profit_margin ? `${item.profit_margin.toFixed(1)}%` : '—', color: '#c084fc' },
    { label: 'Gesamtkosten', value: item.total_cost    ? `€${item.total_cost.toFixed(2)}`    : '—', color: '#475569' },
  ]

  function optionName(list: Option[], id: string | null): string {
    return (id && list.find(o => o.id === id)?.name) || '—'
  }

  function startEdit() {
    const init: Record<string, any> = {}
    for (const f of FIELDS)  init[f.key] = item[f.key] ?? ''
    for (const s of SELECTS) init[s.key] = item[s.key] ?? ''
    setForm(init)
    setError(null)
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    setError(null)
    const payload: Record<string, any> = {}
    for (const f of FIELDS) {
      const v = form[f.key]
      payload[f.key] = f.type === 'number'
        ? (v === '' || v == null ? null : Number(v))
        : (v === '' ? null : v)
    }
    for (const s of SELECTS) payload[s.key] = form[s.key] || null

    try {
      const r = await fetch(`/api/items/${item.id}/details`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await r.json().catch(() => ({} as any))
      if (!r.ok || !j.ok) throw new Error(j.error || 'HTTP ' + r.status)
      setEditing(false)
      router.refresh()
    } catch (e: any) {
      setError((e && e.message) || String(e))
    } finally {
      setSaving(false)
    }
  }

  const selectOptions: Record<string, Option[]> = {
    category_id: categories,
    source_id: sources,
    zone_id: zones,
  }

  return (
    <div className="panel" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '0.85rem', letterSpacing: '0.08em' }}>
          DETAILS <span style={{ color: '#1e293b' }}>//</span>{' '}
          <span style={{ color: '#475569' }}>SPECIFICATIONS</span>
        </h2>
        {!editing ? (
          <button onClick={startEdit}
                  style={{ ...btnBase, background: 'transparent', color: '#06b6d4', border: '1px solid #164e63' }}>
            ✏️ BEARBEITEN
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={save} disabled={saving}
                    style={{ ...btnBase, background: saving ? '#164e63' : '#06b6d4', color: '#050a14', border: 'none', fontWeight: 700 }}>
              {saving ? '…' : '✓ SPEICHERN'}
            </button>
            <button onClick={() => setEditing(false)} disabled={saving}
                    style={{ ...btnBase, background: 'transparent', color: '#64748b', border: '1px solid #334155' }}>
              ✕
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ color: '#ef4444', fontSize: '0.7rem', marginBottom: '0.75rem', fontFamily: 'monospace' }}>
          Fehler: {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
        {FIELDS.map(f => (
          <div key={f.key} style={{ background: '#050a14', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.25rem' }}>{f.label}</div>
            {editing ? (
              <input
                type={f.type}
                step={f.step}
                value={form[f.key] ?? ''}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                style={inputStyle}
              />
            ) : (
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: f.color || '#e0f2fe' }}>
                {fmtValue(f, item[f.key])}
              </div>
            )}
          </div>
        ))}

        {SELECTS.map(s => (
          <div key={s.key} style={{ background: '#050a14', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.25rem' }}>{s.label}</div>
            {editing ? (
              <select
                value={form[s.key] ?? ''}
                onChange={e => setForm(prev => ({ ...prev, [s.key]: e.target.value }))}
                style={inputStyle}
              >
                <option value="">—</option>
                {selectOptions[s.key].map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e0f2fe' }}>
                {optionName(selectOptions[s.key], item[s.key])}
              </div>
            )}
          </div>
        ))}

        {computed.map(d => (
          <div key={d.label} style={{ background: '#050a14', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.75rem 1rem', opacity: editing ? 0.45 : 1 }}>
            <div style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.25rem' }}>{d.label}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: d.color }}>{d.value}</div>
          </div>
        ))}
      </div>

      {editing && (
        <div style={{ fontSize: '0.6rem', color: '#475569', marginTop: '0.75rem', fontFamily: 'monospace' }}>
          Nettogewinn / Marge / Gesamtkosten werden automatisch neu berechnet.
        </div>
      )}
    </div>
  )
}
