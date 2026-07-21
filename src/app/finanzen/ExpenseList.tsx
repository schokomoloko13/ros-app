'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EXPENSE_CATEGORIES, categoryColor, categoryLabel, eur } from '@/lib/expenses'

export type ExpenseRow = {
  id: string
  item_id: string | null
  item_name: string | null
  amount: number
  category: string
  note: string | null
  expense_date: string
  split_group: string | null
}

type ItemOption = { id: string; name: string }

const inputStyle = {
  width: '100%',
  background: '#0a1220',
  border: '1px solid #334155',
  borderRadius: '4px',
  padding: '0.35rem 0.5rem',
  color: '#e0f2fe',
  fontSize: '0.8rem',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box' as const,
}

const btnBase = {
  fontFamily: 'monospace',
  fontSize: '0.65rem',
  letterSpacing: '0.08em',
  padding: '0.3rem 0.7rem',
  borderRadius: '4px',
  cursor: 'pointer',
} as const

function deDate(s: string): string {
  const [y, m, d] = s.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

export default function ExpenseList({
  expenses,
  items,
}: {
  expenses: ExpenseRow[]
  items: ItemOption[]
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})

  function startEdit(e: ExpenseRow) {
    setForm({
      amount: String(e.amount),
      category: e.category,
      expense_date: e.expense_date,
      note: e.note ?? '',
      item_id: e.item_id ?? '',
    })
    setError(null)
    setEditingId(e.id)
  }

  async function save(id: string) {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`/api/expenses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(form.amount),
          category: form.category,
          expense_date: form.expense_date,
          note: form.note === '' ? null : form.note,
          item_id: form.item_id === '' ? null : form.item_id,
        }),
      })
      const j = await r.json().catch(() => ({} as any))
      if (!r.ok || !j.ok) throw new Error(j.error || 'HTTP ' + r.status)
      setEditingId(null)
      router.refresh()
    } catch (e: any) {
      setError((e && e.message) || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Diese Ausgabe wirklich löschen?')) return
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({} as any))
      if (!r.ok || !j.ok) throw new Error(j.error || 'HTTP ' + r.status)
      setEditingId(null)
      router.refresh()
    } catch (e: any) {
      setError((e && e.message) || String(e))
    } finally {
      setBusy(false)
    }
  }

  if (expenses.length === 0) {
    return (
      <div style={{ fontSize: '0.7rem', color: '#475569', padding: '0.5rem 0' }}>
        Keine Ausgaben in dieser Auswahl.
      </div>
    )
  }

  return (
    <div>
      {error && (
        <div style={{ color: '#ef4444', fontSize: '0.7rem', marginBottom: '0.5rem', fontFamily: 'monospace' }}>
          Fehler: {error}
        </div>
      )}

      {expenses.map(e => {
        const editing = editingId === e.id
        return (
          <div
            key={e.id}
            className="fin-exp-row"
            style={{ padding: '0.5rem 0', borderBottom: '1px solid #0f172a', fontSize: '0.72rem' }}
          >
            {editing ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div className="r-fields-2">
                  <div>
                    <label className="form-label">Betrag (€)</label>
                    <input type="number" step="0.01" inputMode="decimal" style={inputStyle}
                           value={form.amount}
                           onChange={ev => setForm(p => ({ ...p, amount: ev.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">Datum</label>
                    <input type="date" style={inputStyle}
                           value={form.expense_date}
                           onChange={ev => setForm(p => ({ ...p, expense_date: ev.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">Kategorie</label>
                    <select style={inputStyle} value={form.category}
                            onChange={ev => setForm(p => ({ ...p, category: ev.target.value }))}>
                      {EXPENSE_CATEGORIES.map(c => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Artikel</label>
                    <select style={inputStyle} value={form.item_id}
                            onChange={ev => setForm(p => ({ ...p, item_id: ev.target.value }))}>
                      <option value="">— allgemeine Ausgabe —</option>
                      {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Notiz</label>
                    <input type="text" style={inputStyle} value={form.note}
                           onChange={ev => setForm(p => ({ ...p, note: ev.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button onClick={() => save(e.id)} disabled={busy}
                          style={{ ...btnBase, background: busy ? '#164e63' : '#06b6d4', color: '#050a14', border: 'none', fontWeight: 700 }}>
                    {busy ? '…' : '✓ SPEICHERN'}
                  </button>
                  <button onClick={() => setEditingId(null)} disabled={busy}
                          style={{ ...btnBase, background: 'transparent', color: '#64748b', border: '1px solid #334155' }}>
                    ✕ ABBRECHEN
                  </button>
                  <button onClick={() => remove(e.id)} disabled={busy}
                          style={{ ...btnBase, background: 'transparent', color: '#ef4444', border: '1px solid #7f1d1d', marginLeft: 'auto' }}>
                    🗑 LÖSCHEN
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="fin-exp-main">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ color: '#f97316', fontWeight: 700 }}>{eur(e.amount)}</span>
                    <span style={{ color: categoryColor(e.category), fontSize: '0.6rem', letterSpacing: '0.06em' }}>
                      {categoryLabel(e.category)}
                    </span>
                    {e.split_group && (
                      <span title="Teil eines Splits"
                            style={{ fontSize: '0.55rem', color: '#a855f7', border: '1px solid #4c1d95', borderRadius: '999px', padding: '0.05rem 0.4rem' }}>
                        SPLIT
                      </span>
                    )}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.62rem', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {deDate(e.expense_date)}
                    {' · '}
                    {e.item_name ?? 'Allgemein'}
                    {e.note ? ` · ${e.note}` : ''}
                  </div>
                </div>
                <button onClick={() => startEdit(e)} aria-label="Ausgabe bearbeiten"
                        style={{ ...btnBase, background: 'transparent', color: '#06b6d4', border: '1px solid #164e63', flex: '0 0 auto' }}>
                  ✏️
                </button>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
