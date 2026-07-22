import { createClient } from '@supabase/supabase-js'
import { categoryLabel } from '@/lib/expenses'

// Kompakte Bestands-Momentaufnahme für Jarvis. Wird vom Sprach-Gespräch
// (realtime) und vom getippten Gespräch (talk) gemeinsam genutzt.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const DAY = 86_400_000

const STATUS_LABEL: Record<string, string> = {
  purchased: 'Eingekauft', checked: 'Geprüft', photographed: 'Fotografiert', listed: 'Gelistet', sold: 'Verkauft',
}

export function buildSnapshot(all: any[]): string {
  const now = Date.now()
  const t = (d?: string | null) => (d ? new Date(d).getTime() : 0)
  const days = (d?: string | null) => Math.max(0, Math.round((now - t(d)) / DAY))
  const euro = (n: number) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 0 })
  const vk = (i: any) => Number(i.target_price ?? 0)

  const count = (s: string) => all.filter(i => i.status === s).length
  const sold = all.filter(i => i.status === 'sold')
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()
  const monthSales = sold.filter(i => t(i.sold_at) >= monthStart)
  const monthRev = monthSales.reduce((s, i) => s + Number(i.sold_price ?? i.target_price ?? 0), 0)

  const lines: string[] = []
  lines.push(`STATUS: Eingekauft ${count('purchased')} · Geprüft ${count('checked')} · Fotografiert ${count('photographed')} · Gelistet ${count('listed')} · Verkauft gesamt ${count('sold')}`)
  lines.push(`MONATSLAUF: ${monthSales.length} Verkäufe · ${euro(monthRev)} € Umsatz`)

  const week = sold
    .filter(i => t(i.sold_at) >= now - 7 * DAY)
    .sort((a, b) => t(b.sold_at) - t(a.sold_at))
    .slice(0, 8)
  lines.push('VERKÄUFE LETZTE 7 TAGE:' + (week.length ? '' : ' keine'))
  for (const i of week) {
    const price = Number(i.sold_price ?? i.target_price ?? 0)
    lines.push(`- ${i.name ?? i.brand ?? 'Artikel'} — ${price ? euro(price) + ' €' : 'Preis offen'} (${new Date(t(i.sold_at)).toLocaleDateString('de-DE')})`)
  }

  const hangers = all
    .filter(i => i.status === 'listed' && days(i.listed_at ?? i.created_at) > 30)
    .sort((a, b) => days(b.listed_at ?? b.created_at) - days(a.listed_at ?? a.created_at))
    .slice(0, 8)
  lines.push(`LADENHÜTER (>30 Tage online): ${hangers.length ? '' : 'keine'}`)
  for (const i of hangers) {
    lines.push(`- ${i.name ?? 'Artikel'} — seit ${days(i.listed_at ?? i.created_at)} Tagen online · VK ${vk(i) ? euro(vk(i)) + ' €' : 'offen'}`)
  }

  const waiting = all
    .filter(i => ['purchased', 'checked', 'photographed'].includes(i.status))
    .sort((a, b) => days(b.purchase_date ?? b.created_at) - days(a.purchase_date ?? a.created_at))
    .slice(0, 8)
  lines.push(`WARTENDE (noch nicht online): ${waiting.length ? '' : 'keine'}`)
  for (const i of waiting) {
    lines.push(`- ${i.name ?? 'Artikel'} — ${STATUS_LABEL[i.status] ?? i.status} · seit ${days(i.purchase_date ?? i.created_at)} Tagen`)
  }

  const active = all.filter(i => i.status !== 'sold').slice(0, 150)
  lines.push(`BESTAND AKTIV (${active.length} Artikel):`)
  for (const i of active) {
    const online = i.status === 'listed' ? `online seit ${days(i.listed_at ?? i.created_at)} Tagen` : 'noch nicht online'
    lines.push(`- ${i.name ?? 'Artikel'} | ${i.brand ?? '–'} | ${STATUS_LABEL[i.status] ?? i.status} | VK ${vk(i) ? euro(vk(i)) + ' €' : '–'} | ${online}`)
  }

  let snap = lines.join('\n')
  if (snap.length > 9000) snap = snap.slice(0, 9000) + '\n… (gekürzt)'
  return snap
}

// Ausgabenseite, damit Jarvis auch auf /finanzen etwas zu sagen hat.
export function buildExpenses(all: any[]): string {
  const euro = (n: number) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 0 })
  const summe = (rows: any[]) => rows.reduce((s, e) => s + Number(e.amount ?? 0), 0)

  const jetzt = new Date()
  const monatsStart = new Date(jetzt.getFullYear(), jetzt.getMonth(), 1).toISOString().slice(0, 10)
  const monat = all.filter(e => String(e.expense_date ?? '') >= monatsStart)

  const lines: string[] = []
  lines.push(`AUSGABEN DIESEN MONAT: ${euro(summe(monat))} € in ${monat.length} Buchungen`)

  const proKategorie = new Map<string, number>()
  for (const e of monat) {
    const k = categoryLabel(String(e.category ?? 'sonstiges'))
    proKategorie.set(k, (proKategorie.get(k) ?? 0) + Number(e.amount ?? 0))
  }
  for (const [k, v] of [...proKategorie].sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${k}: ${euro(v)} €`)
  }

  const letzte = all.slice(0, 10)
  lines.push(`LETZTE BUCHUNGEN: ${letzte.length ? '' : 'keine'}`)
  for (const e of letzte) {
    const notiz = String(e.note ?? '').slice(0, 40)
    lines.push(`- ${e.expense_date ?? '?'} · ${categoryLabel(String(e.category ?? ''))} · ${euro(Number(e.amount ?? 0))} €${notiz ? ' · ' + notiz : ''}`)
  }
  return lines.join('\n')
}

function buildPlatformSignals(metrics: any[], items: any[]): string {
  if (!metrics.length) return ''

  // Pro item_id+platform nur den neusten Scan behalten.
  const latest = new Map<string, any>()
  for (const m of metrics) {
    if (!m.item_id) continue
    const key = `${m.item_id}__${m.platform}`
    if (!latest.has(key)) latest.set(key, m)
  }
  if (!latest.size) return ''

  const nameOf: Record<string, string> = {}
  for (const it of items) {
    if (it.id) nameOf[it.id] = it.name ?? it.brand ?? 'Artikel'
  }

  const byItem = new Map<string, any[]>()
  for (const m of latest.values()) {
    const list = byItem.get(m.item_id) || []
    list.push(m)
    byItem.set(m.item_id, list)
  }

  const newestAt = metrics[0]?.scanned_at
  const scanZeit = newestAt
    ? new Date(newestAt).toLocaleString('de-DE', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' })
    : '?'

  const lines: string[] = [`PLATTFORM-SIGNALE (Scan ${scanZeit}):`]
  for (const [itemId, plattformen] of byItem) {
    const name = nameOf[itemId] ?? itemId
    const parts = plattformen.map(m => {
      const plat = m.platform === 'kleinanzeigen' ? 'KA' : 'Vinted'
      const bits: string[] = []
      if (m.views    != null) bits.push(`${m.views} Aufrufe`)
      if (m.watchers != null) bits.push(`${m.watchers} ${m.platform === 'vinted' ? 'Fav.' : 'Beob.'}`)
      if (m.messages != null) bits.push(`${m.messages} Anfragen`)
      if (m.platform_status && m.platform_status !== 'active')
        bits.push(m.platform_status === 'paused' ? 'pausiert' : 'verkauft')
      return `${plat}: ${bits.length ? bits.join(' · ') : 'keine Daten'}`
    })
    lines.push(`- ${name} | ${parts.join(' | ')}`)
  }
  return lines.join('\n')
}

export async function loadSnapshot(): Promise<string> {
  const [items, expenses, metrics] = await Promise.all([
    supabase
      .from('items')
      .select('id, name, brand, status, target_price, sold_price, sold_at, listed_at, purchase_date, created_at')
      .order('created_at', { ascending: false })
      .limit(400),
    supabase
      .from('expenses')
      .select('amount, category, note, expense_date')
      .order('expense_date', { ascending: false })
      .limit(400),
    supabase
      .from('platform_metrics')
      .select('item_id, platform, views, watchers, messages, platform_status, scanned_at')
      .not('item_id', 'is', null)
      .order('scanned_at', { ascending: false })
      .limit(400),
  ])

  const signals = buildPlatformSignals(metrics.data || [], items.data || [])
  const parts = [buildSnapshot(items.data || []), buildExpenses(expenses.data || [])]
  if (signals) parts.push(signals)
  return parts.join('\n\n')
}
