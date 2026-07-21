import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import ExpenseForm from './ExpenseForm'
import ExpenseList from './ExpenseList'
import { buildPeriod, inWindow, deDate, VIEWS } from './period'
import { EXPENSE_CATEGORIES, eur } from '@/lib/expenses'
import FinanceChart, { type MonthPoint } from './FinanceChart'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Wie /inventory: ISR, Mutationen stoßen revalidatePath('/finanzen') an.
export const revalidate = 30

const STATUS_LABEL: Record<string, string> = {
  purchased: 'Eingekauft', checked: 'Geprüft', photographed: 'Fotografiert',
  listed: 'Gelistet', sold: 'Verkauft',
}
const STATUS_CLASS: Record<string, string> = {
  purchased: 'status-purchased', checked: 'status-checked', photographed: 'status-photographed',
  listed: 'status-listed', sold: 'status-sold',
}

const ITEM_FILTERS = [
  { key: 'alle',     label: 'Alle' },
  { key: 'verkauft', label: 'Verkauft' },
  { key: 'aktiv',    label: 'Aktiv' },
  { key: 'fenster',  label: 'Im Zeitraum verkauft' },
] as const

type SearchParams = Promise<{
  v?: string; d?: string; from?: string; to?: string; cat?: string; f?: string
}>

/** Verkaufsdatum: sold_at ist die saubere Quelle, updated_at der Notnagel. */
function saleDate(item: any): string | null {
  if (item.status !== 'sold') return null
  return (item.sold_at ?? item.updated_at) ?? null
}

/** Umsatz eines verkauften Artikels. sold_price ist die Wahrheit; fehlt er,
 *  bleibt nur der Wunschpreis als Näherung (auf der Seite mit ~ markiert). */
function revenueOf(item: any): { value: number; approx: boolean } {
  if (item.sold_price != null) return { value: Number(item.sold_price), approx: false }
  if (item.target_price != null) return { value: Number(item.target_price), approx: true }
  return { value: 0, approx: true }
}

const chipStyle = (active: boolean) => ({
  padding: '0.3rem 0.7rem',
  borderRadius: '999px',
  border: `1px solid ${active ? '#06b6d4' : '#334155'}`,
  background: active ? 'rgba(6,182,212,0.15)' : 'transparent',
  color: active ? '#22d3ee' : '#94a3b8',
  fontSize: '0.62rem',
  letterSpacing: '0.08em',
  textDecoration: 'none',
  whiteSpace: 'nowrap' as const,
  display: 'inline-flex',
  alignItems: 'center',
})

export default async function FinanzenPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const period = buildPeriod(sp)
  const catFilter = sp.cat && sp.cat !== 'alle' ? sp.cat : null
  const itemFilter = (ITEM_FILTERS.some(f => f.key === sp.f) ? sp.f : 'alle') as string

  const [{ data: items, error: itemsErr }, { data: expenses, error: expErr }] = await Promise.all([
    supabase.from('items')
      .select('id, name, status, purchase_price, target_price, sold_price, sold_at, updated_at, purchase_date, listed_at, created_at'),
    supabase.from('expenses')
      .select('id, item_id, amount, category, note, expense_date, split_group')
      .order('expense_date', { ascending: false }),
  ])

  if (itemsErr || expErr) {
    return (
      <div className="page-shell">
        <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>
          Fehler beim Laden: {itemsErr?.message || expErr?.message}
        </div>
      </div>
    )
  }

  const allItems = items ?? []
  const allExpenses = expenses ?? []
  const itemName = new Map<string, string>(allItems.map(i => [i.id, i.name]))

  // Ausgaben je Artikel über die gesamte Laufzeit — die Artikel-Bilanz fragt
  // "was hat dieser Artikel gekostet", nicht "was fiel im Fenster an".
  const perItem = new Map<string, number>()
  for (const e of allExpenses) {
    if (!e.item_id) continue
    perItem.set(e.item_id, (perItem.get(e.item_id) ?? 0) + Number(e.amount))
  }

  // ── Kennzahlen fürs Fenster ────────────────────────────────────────────
  const soldInWindow = allItems.filter(i => inWindow(saleDate(i), period))
  let umsatz = 0
  let anyApprox = false
  for (const i of soldInWindow) {
    const r = revenueOf(i)
    umsatz += r.value
    if (r.approx) anyApprox = true
  }
  const wareneinsatz = soldInWindow.reduce((s, i) => s + Number(i.purchase_price ?? 0), 0)
  const windowExpenses = allExpenses.filter(e => inWindow(e.expense_date, period))
  const ausgaben = windowExpenses.reduce((s, e) => s + Number(e.amount), 0)
  const gewinn = umsatz - wareneinsatz - ausgaben

  // ── Ausgaben nach Kategorie (im Fenster) ───────────────────────────────
  const byCategory = EXPENSE_CATEGORIES.map(c => {
    const rows = windowExpenses.filter(e => e.category === c.key)
    return { ...c, sum: rows.reduce((s, e) => s + Number(e.amount), 0), count: rows.length }
  }).filter(c => c.count > 0)

  const listedExpenses = catFilter
    ? windowExpenses.filter(e => e.category === catFilter)
    : windowExpenses

  // ── Artikel-Bilanz ─────────────────────────────────────────────────────
  const soldWindowIds = new Set(soldInWindow.map(i => i.id))
  const balanceRows = allItems
    .filter(i => {
      if (itemFilter === 'verkauft') return i.status === 'sold'
      if (itemFilter === 'aktiv')    return i.status !== 'sold'
      if (itemFilter === 'fenster')  return soldWindowIds.has(i.id)
      return true
    })
    .map(i => {
      const exp = perItem.get(i.id) ?? 0
      const sold = i.status === 'sold'
      const r = revenueOf(i)
      return {
        ...i,
        expenses: exp,
        revenue: sold ? r.value : null,
        approx: sold && r.approx,
        // Gewinn nur für verkaufte Artikel — bei laufenden wäre er reine Fiktion.
        profit: sold ? r.value - Number(i.purchase_price ?? 0) - exp : null,
        sale: saleDate(i),
      }
    })
    // Gewinn absteigend; laufende Artikel (profit null) ans Ende.
    .sort((a, b) => {
      if (a.profit == null && b.profit == null) return 0
      if (a.profit == null) return 1
      if (b.profit == null) return -1
      return b.profit - a.profit
    })

  // Links müssen das Zeitfenster mitnehmen, sonst springt die Seite zurück.
  function href(overrides: Record<string, string | null>) {
    const base: Record<string, string | null | undefined> = {
      v: period.view,
      d: period.view === 'frei' ? undefined : period.anchor,
      from: period.view === 'frei' ? period.from : undefined,
      to: period.view === 'frei' ? period.to : undefined,
      cat: catFilter ?? undefined,
      f: itemFilter !== 'alle' ? itemFilter : undefined,
      ...overrides,
    }
    const q = new URLSearchParams()
    for (const [k, val] of Object.entries(base)) {
      if (val != null && val !== '') q.set(k, String(val))
    }
    const s = q.toString()
    return s ? `/finanzen?${s}` : '/finanzen'
  }

  function viewHref(v: string) {
    const q = new URLSearchParams({ v })
    if (v === 'frei') { q.set('from', period.from); q.set('to', period.to) }
    else q.set('d', period.anchor)
    if (catFilter) q.set('cat', catFilter)
    if (itemFilter !== 'alle') q.set('f', itemFilter)
    return `/finanzen?${q.toString()}`
  }

  // buildPeriod liefert den Schritt als "?v=..&d=YYYY-MM-DD"; für die Links
  // wird nur der Anker gebraucht, der Rest kommt aus href().
  const prevAnchor = period.prevHref?.split('d=')[1] ?? null
  const nextAnchor = period.nextHref?.split('d=')[1] ?? null

  const kpis = [
    { label: 'UMSATZ',       value: eur(umsatz),       color: '#22c55e' },
    { label: 'WARENEINSATZ', value: eur(wareneinsatz), color: '#06b6d4' },
    { label: 'AUSGABEN',     value: eur(ausgaben),     color: '#f97316' },
    { label: 'GEWINN',       value: eur(gewinn),       color: gewinn >= 0 ? '#22c55e' : '#ef4444' },
  ]

  // ── Verlauf: 12-Monats-Reihe für den Chart ──────────────────────────
  const nowD = new Date()
  const pad2 = (x: number) => String(x).padStart(2, '0')
  const monthsArr: MonthPoint[] = []
  for (let k = 11; k >= 0; k--) {
    const d = new Date(nowD.getFullYear(), nowD.getMonth() - k, 1)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    monthsArr.push({
      key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`,
      label: d.toLocaleDateString('de-DE', { month: 'short' }),
      firstDay: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`,
      lastDay: `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`,
      umsatz: 0, ausgaben: 0, gewinn: 0,
    })
  }
  const byMonth = new Map(monthsArr.map(m => [m.key, m]))
  for (const i of allItems) {
    const sd = saleDate(i)
    if (!sd) continue
    const m = byMonth.get(String(sd).slice(0, 7))
    if (!m) continue
    const r = revenueOf(i)
    m.umsatz += r.value
    m.gewinn += r.value - Number(i.purchase_price ?? 0)
  }
  for (const e of allExpenses) {
    const m = byMonth.get(String(e.expense_date).slice(0, 7))
    if (!m) continue
    m.ausgaben += Number(e.amount)
    m.gewinn -= Number(e.amount)
  }

  // ── Tempo: Listing → Verkauf, Ladenhüter, Wartende ──────────────────
  const dayDiff = (a: string, b: string) =>
    Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000))
  const daysSince = (s: string) => dayDiff(s, new Date().toISOString())

  const soldTempo = allItems
    .filter(i => i.status === 'sold' && i.sold_at)
    .map(i => ({ i, d: dayDiff(String(i.listed_at ?? i.purchase_date ?? i.created_at), String(i.sold_at)) }))
  const avgTempo = soldTempo.length
    ? Math.round(soldTempo.reduce((s, x) => s + x.d, 0) / soldTempo.length)
    : null
  const fastest = [...soldTempo].sort((a, b) => a.d - b.d).slice(0, 3)
  const hangers = allItems
    .filter(i => i.status === 'listed')
    .map(i => ({ i, d: daysSince(String(i.listed_at ?? i.created_at)) }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 5)
  const waiting = allItems
    .filter(i => ['purchased', 'checked', 'photographed'].includes(i.status))
    .map(i => ({ i, d: daysSince(String(i.purchase_date ?? i.created_at)) }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 5)

  const tempoRow = (entry: { i: any; d: number }, color: string) => (
    <Link key={entry.i.id} href={`/items/${entry.i.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', padding: '0.18rem 0', textDecoration: 'none', borderBottom: '1px solid #0f172a' }}>
      <span style={{ color: '#e0f2fe', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.i.name}</span>
      <span style={{ color, fontWeight: 700, flexShrink: 0, marginLeft: '0.5rem' }}>{entry.d}d</span>
    </Link>
  )

  return (
    <div className="page-shell">
      <div className="crumbs" style={{ marginBottom: '1rem' }}>
        <Link href="/" style={{ color: '#475569', fontSize: '0.7rem', textDecoration: 'none' }}>← COMMAND CENTER</Link>
        <span style={{ color: '#1e293b', fontSize: '0.7rem' }}>/</span>
        <span style={{ color: '#06b6d4', fontSize: '0.7rem' }}>FINANZEN</span>
      </div>

      <div className="page-head" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', letterSpacing: '0.05em', color: '#e0f2fe' }}>
          FINANZEN
        </h1>
        <Link href="/capture"><button className="btn-primary">+ NEUER EINKAUF</button></Link>
      </div>

      {/* ── Zeitraum ──────────────────────────────────────────────────── */}
      <div className="panel" style={{ padding: '0.9rem', marginBottom: '1rem' }}>
        <div className="fin-periodbar">
          {prevAnchor
            ? <Link className="fin-arrow" href={href({ d: prevAnchor })} aria-label="Zeitraum zurück">‹</Link>
            : <span className="fin-arrow" style={{ opacity: 0.3 }}>‹</span>}

          <div className="chip-row" style={{ display: 'flex', gap: '0.35rem', flex: '1 1 auto', minWidth: 0 }}>
            {VIEWS.map(v => (
              <Link key={v.key} href={viewHref(v.key)} className="chip" style={chipStyle(period.view === v.key)}>
                {v.label}
              </Link>
            ))}
          </div>

          {nextAnchor
            ? <Link className="fin-arrow" href={href({ d: nextAnchor })} aria-label="Zeitraum vor">›</Link>
            : <span className="fin-arrow" style={{ opacity: 0.3 }}>›</span>}
        </div>

        <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: '#e0f2fe', fontWeight: 600 }}>
          {period.label}
        </div>

        {period.view === 'frei' && (
          <form method="get" action="/finanzen" className="r-fields-2" style={{ marginTop: '0.6rem' }}>
            <input type="hidden" name="v" value="frei" />
            <div>
              <label className="form-label">Von</label>
              <input className="form-input" type="date" name="from" defaultValue={period.from} />
            </div>
            <div>
              <label className="form-label">Bis</label>
              <input className="form-input" type="date" name="to" defaultValue={period.to} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <button className="btn-primary" type="submit">ANWENDEN</button>
            </div>
          </form>
        )}
      </div>

      {/* ── Kennzahlen ────────────────────────────────────────────────── */}
      <div className="r-stats-4" style={{ marginBottom: '0.75rem' }}>
        {kpis.map(k => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-label" style={{ fontSize: '0.6rem', color: '#475569', letterSpacing: '0.12em' }}>{k.label}</div>
            <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '0.6rem', color: '#475569', marginBottom: '1rem', lineHeight: 1.5 }}>
        Gewinn = Umsatz − Wareneinsatz − Ausgaben.
        {' '}Umsatz und Wareneinsatz zählen die im Zeitraum verkauften Artikel, Ausgaben alle Buchungen im Zeitraum.
        {anyApprox && (
          <>
            {' '}
            <span style={{ color: '#eab308' }}>
              ~ Für Artikel ohne eingetragenen Verkaufspreis wird der Wunschpreis als Näherung verwendet.
            </span>
          </>
        )}
      </div>

      {/* ── Verlauf-Chart: Ziehen wählt den Zeitraum, Klick den Monat ── */}
      <div className="panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
          VERLAUF <span style={{ color: '#1e293b' }}>//</span>{' '}
          <span style={{ color: '#475569' }}>12 MONATE · ZIEHEN = ZEITRAUM · KLICK = MONAT</span>
        </h2>
        <FinanceChart
          months={monthsArr}
          activeFrom={period.view === 'frei' ? period.from : undefined}
          activeTo={period.view === 'frei' ? period.to : undefined}
        />
      </div>

      {/* ── Artikel-Bilanz ────────────────────────────────────────────── */}
      <div className="panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
          ARTIKEL-BILANZ <span style={{ color: '#1e293b' }}>//</span>{' '}
          <span style={{ color: '#475569' }}>{balanceRows.length} ARTIKEL</span>
        </h2>

        <div className="chip-row" style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {ITEM_FILTERS.map(f => (
            <Link key={f.key} href={href({ f: f.key === 'alle' ? null : f.key })}
                  className="chip" style={chipStyle(itemFilter === f.key)}>
              {f.label}
            </Link>
          ))}
        </div>

        <div className="fin-head" style={{ fontSize: '0.55rem', color: '#475569', letterSpacing: '0.1em', paddingBottom: '0.4rem', borderBottom: '1px solid #1e293b' }}>
          <div>ARTIKEL</div>
          <div>STATUS</div>
          <div className="fin-num">EK</div>
          <div className="fin-num">AUSGABEN</div>
          <div className="fin-num">VERKAUF</div>
          <div className="fin-num">GEWINN</div>
          <div className="fin-num">VERKAUFT AM</div>
        </div>

        {balanceRows.length === 0 ? (
          <div style={{ fontSize: '0.7rem', color: '#475569', padding: '0.75rem 0' }}>Keine Artikel in dieser Auswahl.</div>
        ) : balanceRows.map(r => (
          <Link key={r.id} href={`/items/${r.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
            <div className="fin-row" style={{ padding: '0.5rem 0', borderBottom: '1px solid #0f172a', fontSize: '0.72rem' }}>
              <div className="fin-cell-name" style={{ color: '#e0f2fe', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}
              </div>
              <div>
                <span className={`status-badge ${STATUS_CLASS[r.status] ?? ''}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
              <div className="fin-num" data-l="EK" style={{ color: '#94a3b8' }}>{eur(r.purchase_price)}</div>
              <div className="fin-num" data-l="AUSG." style={{ color: r.expenses > 0 ? '#f97316' : '#334155' }}>{eur(r.expenses)}</div>
              <div className="fin-num" data-l="VK" style={{ color: r.revenue != null ? '#22d3ee' : '#334155' }}>
                {r.revenue != null ? `${r.approx ? '~' : ''}${eur(r.revenue)}` : '—'}
              </div>
              <div className="fin-num" data-l="GEWINN" style={{ fontWeight: 700, color: r.profit == null ? '#334155' : r.profit >= 0 ? '#22c55e' : '#ef4444' }}>
                {r.profit == null ? '—' : `${r.profit >= 0 ? '+' : ''}${eur(r.profit)}`}
              </div>
              <div className="fin-num" data-l="AM" style={{ color: '#475569' }}>{r.sale ? deDate(r.sale) : '—'}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Tempo: wie schnell verkauft sich was ─────────────────────── */}
      <div className="panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
          TEMPO <span style={{ color: '#1e293b' }}>//</span>{' '}
          <span style={{ color: '#475569' }}>LISTING → VERKAUF</span>
        </h2>
        <div className="r-stats-4">
          <div className="kpi-card">
            <div className="kpi-label" style={{ fontSize: '0.6rem', color: '#475569', letterSpacing: '0.12em' }}>Ø TAGE BIS VERKAUF</div>
            <div className="kpi-value" style={{ color: '#06b6d4' }}>{avgTempo ?? '—'}</div>
            <div style={{ fontSize: '0.6rem', color: '#334155', marginTop: '2px' }}>{soldTempo.length} Verkäufe</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label" style={{ fontSize: '0.6rem', color: '#475569', letterSpacing: '0.12em' }}>SCHNELLSELLER</div>
            {fastest.length === 0 && <div style={{ fontSize: '0.7rem', color: '#334155' }}>Noch keine Verkäufe mit Datum.</div>}
            {fastest.map(x => tempoRow(x, '#22c55e'))}
          </div>
          <div className="kpi-card">
            <div className="kpi-label" style={{ fontSize: '0.6rem', color: '#475569', letterSpacing: '0.12em' }}>LADENHÜTER (ONLINE)</div>
            {hangers.length === 0 && <div style={{ fontSize: '0.7rem', color: '#334155' }}>Nichts gelistet.</div>}
            {hangers.map(x => tempoRow(x, x.d > 30 ? '#f97316' : '#64748b'))}
          </div>
          <div className="kpi-card">
            <div className="kpi-label" style={{ fontSize: '0.6rem', color: '#475569', letterSpacing: '0.12em' }}>WARTENDE (NOCH NICHT ONLINE)</div>
            {waiting.length === 0 && <div style={{ fontSize: '0.7rem', color: '#334155' }}>Alles online.</div>}
            {waiting.map(x => tempoRow(x, '#06b6d4'))}
            <div style={{ fontSize: '0.55rem', color: '#334155', marginTop: '0.35rem', lineHeight: 1.4 }}>
              Tage seit Kauf — antizyklischer Kauf, kein Deadstock.
            </div>
          </div>
        </div>
      </div>

      {/* ── Ausgaben ──────────────────────────────────────────────────── */}
      <div className="panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
          AUSGABEN <span style={{ color: '#1e293b' }}>//</span>{' '}
          <span style={{ color: '#475569' }}>{eur(ausgaben)} IM ZEITRAUM</span>
        </h2>

        <div className="chip-row" style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <Link href={href({ cat: null })} className="chip" style={chipStyle(!catFilter)}>Alle</Link>
          {byCategory.map(c => (
            <Link key={c.key} href={href({ cat: catFilter === c.key ? null : c.key })}
                  className="chip"
                  style={{ ...chipStyle(catFilter === c.key), borderColor: catFilter === c.key ? c.color : '#334155' }}>
              <span style={{ color: c.color }}>{c.label}</span>
              <span style={{ marginLeft: '0.35rem', color: '#e0f2fe', fontWeight: 700 }}>{eur(c.sum)}</span>
            </Link>
          ))}
          {byCategory.length === 0 && (
            <span style={{ fontSize: '0.62rem', color: '#334155' }}>Keine Ausgaben im Zeitraum.</span>
          )}
        </div>

        <ExpenseList
          expenses={listedExpenses.map(e => ({
            id: e.id,
            item_id: e.item_id,
            item_name: e.item_id ? (itemName.get(e.item_id) ?? '—') : null,
            amount: Number(e.amount),
            category: e.category,
            note: e.note,
            expense_date: String(e.expense_date).slice(0, 10),
            split_group: e.split_group,
          }))}
          items={allItems.map(i => ({ id: i.id, name: i.name }))}
        />
      </div>

      {/* ── Neue Ausgabe ──────────────────────────────────────────────── */}
      <ExpenseForm items={allItems.map(i => ({ id: i.id, name: i.name, status: i.status }))} />
    </div>
  )
}
