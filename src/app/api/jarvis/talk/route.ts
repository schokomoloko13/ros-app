import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractText, generateContent, modelChain } from '../gemini'

// JARVIS Gespräch (/api/jarvis/talk) — freie Konversation mit Live-Daten.
// Nimmt eine Frage (Sprache oder Text), baut eine kompakte Bestands-Momentaufnahme
// aus Supabase und lässt Gemini darauf antworten. Antwort wird gesprochen.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export const dynamic = 'force-dynamic'

const MODELS = modelChain(process.env.GEMINI_MODEL, ['gemini-3.5-flash', 'gemini-2.5-flash'])
const DAY = 86_400_000

const SYSTEM = `Du bist J.A.R.V.I.S. — Just A Rather Very Intelligent System — das Betriebssystem von Robertos Uhren-Resale-Geschaeft (R.O.S.).
Regeln:
- Antworte auf Deutsch, in natuerlicher gesprochener Sprache. Deine Antwort wird vorgelesen.
- Maximal 3 kurze Saetze. Keine Listen, kein Markdown, keine Sternchen, keine Emojis.
- Preise als gesprochene Zahlen nennen, zum Beispiel "3.200 Euro".
- Nutze NUR die Daten unten. Wenn etwas nicht in den Daten steht, sag ehrlich, dass du es nicht weisst.
- Tonfall: freundlich-professionell, dezent trocken wie ein britischer Butler. Sprich Roberto mit "Sie" an.
- Wenn eine Seite der App zur Antwort passt, beende die Antwort mit [[LINK:/pfad]]. Moeglich: /inventory (alle Artikel), /finanzen (Geld), /tempo (Schnellseller und Ladenhueter), /matrix (Plattformen), /capture (neuer Artikel). Sonst keinen Link.`

const STATUS_LABEL: Record<string, string> = {
  purchased: 'Eingekauft', checked: 'Geprüft', photographed: 'Fotografiert', listed: 'Gelistet', sold: 'Verkauft',
}

function buildSnapshot(all: any[]): string {
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
  lines.push('VERKÄUFE LETZTE 7 TAGE:' + (week.length
    ? ''
    : ' keine'))
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

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'GEMINI_API_KEY ist nicht gesetzt (Netlify + .env.local).' }, { status: 500 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }
  const message = String(body?.message ?? '').trim().slice(0, 1000)
  if (!message) return NextResponse.json({ error: 'Leere Nachricht.' }, { status: 400 })

  const { data: items } = await supabase
    .from('items')
    .select('name, brand, status, target_price, sold_price, sold_at, listed_at, purchase_date, created_at')
    .order('created_at', { ascending: false })
    .limit(400)

  const snapshot = buildSnapshot(items || [])

  const history = Array.isArray(body?.history) ? body.history.slice(-6) : []
  const contents = [
    ...history.map((h: any) => ({
      role: h?.role === 'user' ? 'user' : 'model',
      parts: [{ text: String(h?.text ?? '').slice(0, 800) }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ]

  const { res, model } = await generateContent(MODELS, key, {
    systemInstruction: { parts: [{ text: `${SYSTEM}\n\nAKTUELLE DATEN (Stand jetzt):\n${snapshot}` }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 320,
      // Gemini 3.x denkt sonst laut und frisst das Token-Budget auf, bevor die
      // eigentliche Antwort kommt. Drei Butler-Sätze brauchen kein Nachdenken.
      thinkingConfig: { thinkingBudget: 0 },
    },
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return NextResponse.json(
      { error: `Gemini-Fehler ${res.status} (${model}): ${detail.slice(0, 300)}` },
      { status: 502 }
    )
  }

  const json = await res.json()
  let reply = extractText(json)
  if (!reply) return NextResponse.json({ error: 'Keine Antwort vom Modell.' }, { status: 502 })

  let link: string | null = null
  const m = reply.match(/\[\[LINK:([^\]]+)\]\]/)
  if (m) {
    link = m[1].trim()
    reply = reply.replace(m[0], '').trim()
  }

  return NextResponse.json({ reply, link })
}
