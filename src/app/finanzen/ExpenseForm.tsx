'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EXPENSE_CATEGORIES, eur, todayISO } from '@/lib/expenses'

type ItemOption = { id: string; name: string; status: string }

const inputStyle = {
  width: '100%',
  background: '#0a1220',
  border: '1px solid #334155',
  borderRadius: '4px',
  padding: '0.4rem 0.55rem',
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
  padding: '0.35rem 0.8rem',
  borderRadius: '4px',
  cursor: 'pointer',
} as const

export default function ExpenseForm({ items }: { items: ItemOption[] }) {
  const router = useRouter()

  const [amount, setAmount]     = useState('')
  const [category, setCategory] = useState('transport')
  const [date, setDate]         = useState(todayISO())
  const [note, setNote]         = useState('')
  const [query, setQuery]       = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [mode, setMode]         = useState<'equal' | 'manual'>('equal')
  const [shares, setShares]     = useState<Record<string, string>>({})

  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(i => i.name.toLowerCase().includes(q))
  }, [items, query])

  const total = parseFloat(amount) || 0
  const shareSum = selected.reduce((s, id) => s + (parseFloat(shares[id]) || 0), 0)
  // Nur ein Hinweis, kein Fehler — Speichern bleibt erlaubt.
  const shareMismatch = mode === 'manual' && selected.length > 0 && Math.abs(shareSum - total) > 0.005

  function toggle(id: string) {
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  function reset() {
    setAmount(''); setNote(''); setSelected([]); setShares({}); setQuery('')
  }

  async function submit() {
    setBusy(true); setError(null); setOkMsg(null)
    try {
      if (!Number.isFinite(parseFloat(amount))) throw new Error('Bitte einen Betrag eingeben.')
      const body: Record<string, any> = {
        amount: parseFloat(amount),
        category,
        expense_date: date,
        note: note.trim() || null,
      }
      if (selected.length > 0) {
        body.mode = mode
        body.items = selected.map(id => ({
          item_id: id,
          ...(mode === 'manual' ? { share_amount: parseFloat(shares[id]) || 0 } : {}),
        }))
      }

      const r = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({} as any))
      if (!r.ok || !j.ok) throw new Error(j.error || 'HTTP ' + r.status)

      setOkMsg(j.count > 1 ? `${j.count} Zeilen angelegt (Split).` : 'Ausgabe angelegt.')
      reset()
      router.refresh()
    } catch (e: any) {
      setError((e && e.message) || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel" style={{ padding: '1rem' }}>
      <h2 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
        AUSGABE EINTRAGEN <span style={{ color: '#1e293b' }}>//</span>{' '}
        <span style={{ color: '#475569' }}>
          {selected.length === 0 ? 'ALLGEMEIN' : `${selected.length} ARTIKEL`}
        </span>
      </h2>

      {error && (
        <div style={{ color: '#ef4444', fontSize: '0.7rem', marginBottom: '0.5rem', fontFamily: 'monospace' }}>
          Fehler: {error}
        </div>
      )}
      {okMsg && (
        <div style={{ color: '#22c55e', fontSize: '0.7rem', marginBottom: '0.5rem', fontFamily: 'monospace' }}>
          ✓ {okMsg}
        </div>
      )}

      <div className="r-fields-2" style={{ marginBottom: '0.6rem' }}>
        <div>
          <label className="form-label">Betrag (€)</label>
          <input type="number" min="0" step="0.01" inputMode="decimal" style={inputStyle}
                 placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Datum</label>
          <input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className="form-label">Kategorie</label>
          <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Notiz</label>
          <input type="text" style={inputStyle} placeholder="optional"
                 value={note} onChange={e => setNote(e.target.value)} />
        </div>
      </div>

      {/* ── Artikel-Auswahl ─────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #1e293b', paddingTop: '0.6rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
          <label className="form-label" style={{ margin: 0 }}>
            Artikel <span style={{ color: '#334155' }}>(keiner = allgemeine Ausgabe)</span>
          </label>
          {selected.length > 0 && (
            <button type="button" onClick={() => setSelected([])}
                    style={{ ...btnBase, background: 'transparent', color: '#64748b', border: '1px solid #334155' }}>
              AUSWAHL LEEREN
            </button>
          )}
        </div>

        <input type="text" style={{ ...inputStyle, marginBottom: '0.4rem' }} placeholder="Artikel suchen…"
               value={query} onChange={e => setQuery(e.target.value)} />

        <div style={{ maxHeight: '13rem', overflowY: 'auto', border: '1px solid #1e293b', borderRadius: '6px', background: '#050a14' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '0.6rem', fontSize: '0.65rem', color: '#475569' }}>Kein Artikel gefunden.</div>
          ) : filtered.map(i => {
            const on = selected.includes(i.id)
            return (
              <div key={i.id}
                   style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', borderBottom: '1px solid #0f172a' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 auto', minWidth: 0, cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(i.id)}
                         style={{ accentColor: '#06b6d4', width: '1rem', height: '1rem', flex: '0 0 auto' }} />
                  <span style={{ fontSize: '0.7rem', color: on ? '#e0f2fe' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.name}
                  </span>
                </label>
                {on && mode === 'manual' && (
                  <input type="number" step="0.01" inputMode="decimal" placeholder="0.00"
                         style={{ ...inputStyle, width: '5.5rem', flex: '0 0 auto', padding: '0.25rem 0.4rem' }}
                         value={shares[i.id] ?? ''}
                         onChange={e => setShares(p => ({ ...p, [i.id]: e.target.value }))} />
                )}
                {on && mode === 'equal' && (
                  <span style={{ fontSize: '0.62rem', color: '#f97316', flex: '0 0 auto' }}>
                    {eur(total / selected.length)}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {selected.length > 0 && (
          <div style={{ marginTop: '0.5rem' }}>
            <div className="chip-row" style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {(['equal', 'manual'] as const).map(m => (
                <button key={m} type="button" onClick={() => setMode(m)} className="chip"
                        style={{
                          ...btnBase,
                          borderRadius: '999px',
                          border: `1px solid ${mode === m ? '#06b6d4' : '#334155'}`,
                          background: mode === m ? 'rgba(6,182,212,0.15)' : 'transparent',
                          color: mode === m ? '#22d3ee' : '#94a3b8',
                        }}>
                  {m === 'equal' ? 'GLEICHMÄSSIG AUFTEILEN' : 'BETRÄGE SELBST VERTEILEN'}
                </button>
              ))}
            </div>
            {mode === 'manual' && (
              <div style={{ fontSize: '0.62rem', marginTop: '0.4rem', color: shareMismatch ? '#eab308' : '#475569' }}>
                Summe der Anteile: {eur(shareSum)} von {eur(total)}
                {shareMismatch && ' — weicht vom Gesamtbetrag ab. Speichern ist trotzdem möglich.'}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? '…' : '+ AUSGABE SPEICHERN'}
        </button>
      </div>
    </div>
  )
}
