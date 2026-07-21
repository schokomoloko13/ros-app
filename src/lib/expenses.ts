// Ausgaben-Kategorien. Feste Liste — die DB hat bewusst keinen Enum-Typ
// (ein neuer Wert wäre sonst eine Migration), darum wird hier validiert.
export const EXPENSE_CATEGORIES = [
  { key: 'transport',  label: 'Transport/Uber',     color: '#f97316' },
  { key: 'versand',    label: 'Versand',            color: '#06b6d4' },
  { key: 'verpackung', label: 'Verpackung',         color: '#a855f7' },
  { key: 'gebuehren',  label: 'Plattform-Gebühren', color: '#eab308' },
  { key: 'pauschale',  label: 'Pauschale',          color: '#64748b' },
  { key: 'sonstiges',  label: 'Sonstiges',          color: '#94a3b8' },
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['key']

export const CATEGORY_KEYS: string[] = EXPENSE_CATEGORIES.map(c => c.key)

export function categoryLabel(key: string): string {
  return EXPENSE_CATEGORIES.find(c => c.key === key)?.label ?? key
}

export function categoryColor(key: string): string {
  return EXPENSE_CATEGORIES.find(c => c.key === key)?.color ?? '#94a3b8'
}

export function isCategory(v: unknown): boolean {
  return typeof v === 'string' && CATEGORY_KEYS.includes(v)
}

export function eur(n: number | null | undefined): string {
  return `€${Number(n ?? 0).toFixed(2)}`
}

// ISO-Datum (YYYY-MM-DD) in lokaler Zeit. new Date().toISOString() wäre UTC
// und würde abends in Deutschland auf den Folgetag springen.
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
