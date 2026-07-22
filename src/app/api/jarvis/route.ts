import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// JARVIS Briefing (/api/jarvis) — Tages-Briefing aus echten Daten.
// ?slot=abend → Tagesrückblick (Verkäufe/Listings HEUTE, statt 24h).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export const dynamic = 'force-dynamic'

const OWNER = process.env.JARVIS_OWNER_NAME ?? 'Roberto'

const spokenEur = (n: number) =>
  `${Number(n).toLocaleString('de-DE', { maximumFractionDigits: 0 })} Euro`

function greeting(h: number): string {
  if (h >= 5 && h < 11) return 'Guten Morgen'
  if (h >= 11 && h < 17) return 'Guten Tag'
  if (h >= 17 && h < 23) return 'Guten Abend'
  return 'Nachtschicht,'
}

export async function GET(req: NextRequest) {
  const slot = req.nextUrl.searchParams.get('slot') === 'abend' ? 'abend' : 'morgen'

  const now = new Date()
  const t = (d?: string | null) => (d ? new Date(d).getTime() : 0)
  const windowStart = slot === 'abend'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() // heute 0 Uhr
    : now.getTime() - 24 * 3600_000                                        // letzte 24h
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

  const { data: items } = await supabase
    .from('items')
    .select('id, name, brand, status, sold_price, target_price, sold_at, listed_at, created_at')

  const all = items || []

  const soldWin = all
    .filter(i => i.status === 'sold' && t(i.sold_at) >= windowStart)
    .sort((a, b) => t(b.sold_at) - t(a.sold_at))
  const listedWin = all.filter(i => i.status !== 'sold' && t(i.listed_at) >= windowStart)
  const waitPhotos = all.filter(i => ['purchased', 'checked'].includes(i.status))
  const waitListing = all.filter(i => i.status === 'photographed')
  const hangers = all.filter(i => i.status === 'listed' && t(i.listed_at) > 0 && now.getTime() - t(i.listed_at) > 30 * 86_400_000)
  const monthSales = all.filter(i => i.status === 'sold' && t(i.sold_at) >= monthStart)
  const monthRevenue = monthSales.reduce((s, i) => s + Number(i.sold_price ?? i.target_price ?? 0), 0)
  const revenueWin = soldWin.reduce((s, i) => s + Number(i.sold_price ?? i.target_price ?? 0), 0)

  const parts: string[] = []
  parts.push(`${greeting(now.getHours())} ${OWNER}.`)

  if (slot === 'morgen') {
    const dayStr = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
    parts.push(`Hier ist Ihr Tages-Briefing für ${dayStr}.`)

    if (soldWin.length > 0) {
      const names = soldWin.slice(0, 3).map(i => {
        const label = i.name || i.brand || 'Ein Artikel'
        const price = Number(i.sold_price ?? i.target_price ?? 0)
        return price > 0 ? `${label} für ${spokenEur(price)}` : label
      })
      const more = soldWin.length > 3 ? ` und ${soldWin.length - 3} weitere` : ''
      parts.push(
        `In den letzten 24 Stunden ${soldWin.length === 1 ? 'wurde 1 Artikel verkauft' : `wurden ${soldWin.length} Artikel verkauft`}: ${names.join(', ')}${more}. Umsatz: ${spokenEur(revenueWin)}.`
      )
    } else {
      parts.push('In den letzten 24 Stunden gab es keine neuen Verkäufe.')
    }

    if (listedWin.length > 0) {
      parts.push(`${listedWin.length} ${listedWin.length === 1 ? 'Artikel wurde' : 'Artikel wurden'} neu gelistet.`)
    }

    const work: string[] = []
    if (waitPhotos.length > 0) work.push(`${waitPhotos.length} ${waitPhotos.length === 1 ? 'wartet' : 'warten'} auf Fotos`)
    if (waitListing.length > 0) work.push(`${waitListing.length} ${waitListing.length === 1 ? 'ist' : 'sind'} fotografiert und bereit zum Listen`)
    parts.push(work.length > 0 ? `Auf dem Tisch liegt: ${work.join(', ')}.` : 'Der Tisch ist leer — kein Rückstand.')

    if (hangers.length > 0) {
      parts.push(`Achtung: ${hangers.length} ${hangers.length === 1 ? 'Artikel ist' : 'Artikel sind'} seit über 30 Tagen online. Relist-Kandidaten.`)
    }

    parts.push(
      monthSales.length > 0
        ? `Monatsstand: ${monthSales.length} ${monthSales.length === 1 ? 'Verkauf' : 'Verkäufe'}, ${spokenEur(monthRevenue)} Umsatz.`
        : 'In diesem Monat wurde noch nichts verkauft.'
    )
    parts.push('Systeme bereit. Viel Erfolg heute.')
  } else {
    parts.push('Der Tagesrückblick.')

    if (soldWin.length > 0) {
      const names = soldWin.slice(0, 3).map(i => {
        const label = i.name || i.brand || 'Ein Artikel'
        const price = Number(i.sold_price ?? i.target_price ?? 0)
        return price > 0 ? `${label} für ${spokenEur(price)}` : label
      })
      const more = soldWin.length > 3 ? ` und ${soldWin.length - 3} weitere` : ''
      parts.push(
        `Heute ${soldWin.length === 1 ? 'wurde 1 Artikel verkauft' : `wurden ${soldWin.length} Artikel verkauft`}: ${names.join(', ')}${more}. Tagesumsatz: ${spokenEur(revenueWin)}. Ein guter Tag.`
      )
    } else {
      parts.push('Heute gab es keine Verkäufe.')
    }

    if (listedWin.length > 0) {
      parts.push(`${listedWin.length} ${listedWin.length === 1 ? 'Artikel ist' : 'Artikel sind'} heute neu online gegangen.`)
    }

    const work: string[] = []
    if (waitPhotos.length > 0) work.push(`${waitPhotos.length} ${waitPhotos.length === 1 ? 'wartet' : 'warten'} auf Fotos`)
    if (waitListing.length > 0) work.push(`${waitListing.length} ${waitListing.length === 1 ? 'ist' : 'sind'} bereit zum Listen`)
    parts.push(work.length > 0 ? `Für morgen liegt bereit: ${work.join(', ')}.` : 'Es gibt keinen Rückstand für morgen.')

    if (hangers.length > 0) {
      parts.push(`Zur Erinnerung: ${hangers.length} ${hangers.length === 1 ? 'Artikel läuft' : 'Artikel laufen'} bereits seit über 30 Tagen.`)
    }

    parts.push(
      monthSales.length > 0
        ? `Der Monat steht bei ${monthSales.length} ${monthSales.length === 1 ? 'Verkauf' : 'Verkäufen'} und ${spokenEur(monthRevenue)} Umsatz.`
        : 'In diesem Monat wurde noch nichts verkauft.'
    )
    parts.push('Gute Nacht, Roberto. Die Systeme gehen in den Ruhemodus.')
  }

  return NextResponse.json({
    text: parts.join(' '),
    slot,
    facts: {
      sold: soldWin.length,
      revenue: revenueWin,
      listed: listedWin.length,
      waitPhotos: waitPhotos.length,
      waitListing: waitListing.length,
      hangers: hangers.length,
      monthSales: monthSales.length,
      monthRevenue,
    },
  })
}
