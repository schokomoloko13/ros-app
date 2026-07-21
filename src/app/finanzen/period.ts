// Zeitfenster der Finanzen-Seite. Alles läuft über die URL, damit die Pfeile
// und Chips reine Links sein können (kein Client-State, kein Nachladen).

export type ViewKey = 'heute' | 'woche' | 'monat' | 'jahr' | 'frei'

export const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'heute', label: 'HEUTE' },
  { key: 'woche', label: 'WOCHE' },
  { key: 'monat', label: 'MONAT' },
  { key: 'jahr',  label: 'JAHR'  },
  { key: 'frei',  label: 'FREI'  },
]

const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

/** ISO-Datum (YYYY-MM-DD) — lokale Zeit, nicht UTC. */
export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Parst YYYY-MM-DD als lokales Datum (new Date('...') wäre UTC). */
export function parseISO(s: string | undefined | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export function deDate(s: string | null | undefined): string {
  if (!s) return '—'
  const [y, m, d] = String(s).slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

/** Montag der Woche, in der d liegt. */
function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7 // Mo=0 … So=6
  x.setDate(x.getDate() - dow)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() + n)
  return x
}

function isoWeekNumber(d: Date): number {
  // ISO 8601: Woche 1 ist die Woche mit dem ersten Donnerstag des Jahres.
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7))
  const firstThursday = new Date(t.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7))
  return 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
}

export type Period = {
  view: ViewKey
  /** Ankerdatum, aus dem das Fenster berechnet wird (ISO). */
  anchor: string
  /** Fenstergrenzen, beide inklusive (ISO). */
  from: string
  to: string
  label: string
  /** Query-Strings für die ‹ › Pfeile; null bei FREI (kein sinnvoller Schritt). */
  prevHref: string | null
  nextHref: string | null
}

export function buildPeriod(params: {
  v?: string
  d?: string
  from?: string
  to?: string
}): Period {
  const today = new Date()
  const rawView = (params.v ?? 'monat') as ViewKey
  const view: ViewKey = VIEWS.some(x => x.key === rawView) ? rawView : 'monat'

  if (view === 'frei') {
    const f = parseISO(params.from) ?? new Date(today.getFullYear(), today.getMonth(), 1)
    const t = parseISO(params.to) ?? today
    // Vertauschte Eingaben nicht als leeres Fenster durchreichen.
    const [a, b] = f <= t ? [f, t] : [t, f]
    return {
      view, anchor: iso(a), from: iso(a), to: iso(b),
      label: `${deDate(iso(a))} – ${deDate(iso(b))}`,
      prevHref: null, nextHref: null,
    }
  }

  const anchor = parseISO(params.d) ?? today
  let from: Date, to: Date, label: string, prevA: Date, nextA: Date

  if (view === 'heute') {
    from = to = anchor
    label = deDate(iso(anchor))
    prevA = addDays(anchor, -1)
    nextA = addDays(anchor, 1)
  } else if (view === 'woche') {
    from = startOfWeek(anchor)
    to = addDays(from, 6)
    label = `KW ${isoWeekNumber(from)} · ${deDate(iso(from))} – ${deDate(iso(to))}`
    prevA = addDays(from, -7)
    nextA = addDays(from, 7)
  } else if (view === 'monat') {
    from = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
    label = `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
    prevA = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1)
    nextA = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
  } else {
    from = new Date(anchor.getFullYear(), 0, 1)
    to = new Date(anchor.getFullYear(), 11, 31)
    label = String(anchor.getFullYear())
    prevA = new Date(anchor.getFullYear() - 1, 0, 1)
    nextA = new Date(anchor.getFullYear() + 1, 0, 1)
  }

  return {
    view,
    anchor: iso(anchor),
    from: iso(from),
    to: iso(to),
    label,
    prevHref: `?v=${view}&d=${iso(prevA)}`,
    nextHref: `?v=${view}&d=${iso(nextA)}`,
  }
}

/** Liegt ein ISO-Datum (oder Timestamp) im Fenster? */
export function inWindow(value: string | null | undefined, p: Period): boolean {
  if (!value) return false
  const day = String(value).slice(0, 10)
  return day >= p.from && day <= p.to
}
