import { createClient } from '@supabase/supabase-js'

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

export async function loadSnapshot(): Promise<string> {
  const { data: items } = await supabase
    .from('items')
    .select('name, brand, status, target_price, sold_price, sold_at, listed_at, purchase_date, created_at')
    .order('created_at', { ascending: false })
    .limit(400)
  return buildSnapshot(items || [])
}
