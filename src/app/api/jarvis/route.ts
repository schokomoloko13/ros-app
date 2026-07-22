import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// JARVIS Briefing (/api/jarvis) — baut aus den echten Bestandsdaten
// ein gesprochenes Tages-Briefing: Begrüßung, Verkäufe (24h), Arbeit,
// Ladenhüter, Monatsstand. Wird vom Dashboard-Orb abgerufen.
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

export async function GET() {
  const now = new Date()
  const t24 = now.getTime() - 24 * 3600_000
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const t = (d?: string | null) => (d ? new Date(d).getTime() : 0)

  const { data: items } = await supabase
    .from('items')
    .select('id, name, brand, status, sold_price, target_price, sold_at, listed_at, created_at')

  const all = items || []

  const sold24 = all
    .filter(i => i.status === 'sold' && t(i.sold_at) >= t24)
    .sort((a, b) => t(b.sold_at) - t(a.sold_at))
  const listed24 = all.filter(i => i.status !== 'sold' && t(i.listed_at) >= t24)
  const waitPhotos = all.filter(i => ['purchased', 'checked'].includes(i.status))
  const waitListing = all.filter(i => i.status === 'photographed')
  const hangers = all.filter(i => i.status === 'listed' && t(i.listed_at) > 0 && now.getTime() - t(i.listed_at) > 30 * 86_400_000)
  const monthSales = all.filter(i => i.status === 'sold' && t(i.sold_at) >= monthStart)
  const monthRevenue = monthSales.reduce((s, i) => s + Number(i.sold_price ?? i.target_price ?? 0), 0)
  const revenue24 = sold24.reduce((s, i) => s + Number(i.sold_price ?? i.target_price ?? 0), 0)

  const parts: string[] = []

  parts.push(`${greeting(now.getHours())} ${OWNER}.`)

  const dayStr = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
  parts.push(`Heute ist ${dayStr}.`)

  if (sold24.length > 0) {
    const names = sold24.slice(0, 3).map(i => {
      const label = i.name || i.brand || 'Ein Artikel'
      const price = Number(i.sold_price ?? i.target_price ?? 0)
      return price > 0 ? `${label} für ${spokenEur(price)}` : label
    })
    const more = sold24.length > 3 ? ` und ${sold24.length - 3} weitere` : ''
    parts.push(
      `In den letzten 24 Stunden ${sold24.length === 1 ? 'wurde 1 Artikel verkauft' : `wurden ${sold24.length} Artikel verkauft`}: ${names.join(', ')}${more}. Umsatz: ${spokenEur(revenue24)}.`
    )
  } else {
    parts.push('In den letzten 24 Stunden gab es keine neuen Verkäufe.')
  }

  if (listed24.length > 0) {
    parts.push(`${listed24.length} ${listed24.length === 1 ? 'Artikel wurde' : 'Artikel wurden'} neu gelistet.`)
  }

  const work: string[] = []
  if (waitPhotos.length > 0) work.push(`${waitPhotos.length} ${waitPhotos.length === 1 ? 'wartet' : 'warten'} auf Fotos`)
  if (waitListing.length > 0) work.push(`${waitListing.length} ${waitListing.length === 1 ? 'ist' : 'sind'} fotografiert und bereit zum Listen`)
  if (work.length > 0) {
    parts.push(`Auf dem Tisch liegt: ${work.join(', ')}.`)
  } else {
    parts.push('Der Tisch ist leer — kein Rückstand.')
  }

  if (hangers.length > 0) {
    parts.push(`Achtung: ${hangers.length} ${hangers.length === 1 ? 'Artikel ist' : 'Artikel sind'} seit über 30 Tagen online. Relist-Kandidaten.`)
  }

  parts.push(
    monthSales.length > 0
      ? `Monatsstand: ${monthSales.length} ${monthSales.length === 1 ? 'Verkauf' : 'Verkäufe'}, ${spokenEur(monthRevenue)} Umsatz.`
      : 'In diesem Monat wurde noch nichts verkauft.'
  )

  parts.push('Systeme bereit. Viel Erfolg heute.')

  return NextResponse.json({
    text: parts.join(' '),
    facts: {
      sold24: sold24.length,
      revenue24,
      listed24: listed24.length,
      waitPhotos: waitPhotos.length,
      waitListing: waitListing.length,
      hangers: hangers.length,
      monthSales: monthSales.length,
      monthRevenue,
    },
  })
}
