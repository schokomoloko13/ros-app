import { NextRequest, NextResponse } from 'next/server'
import { extractText, generateContent, modelChain } from '../gemini'
import { loadSnapshot } from '../snapshot'

// JARVIS Gespräch (/api/jarvis/talk) — freie Konversation mit Live-Daten.
// Nimmt eine Frage (Sprache oder Text), baut eine kompakte Bestands-Momentaufnahme
// aus Supabase und lässt Gemini darauf antworten.
// Das gesprochene Gespräch läuft inzwischen über /api/jarvis/realtime — diese
// Route bedient weiterhin getippte Fragen.
export const dynamic = 'force-dynamic'

const MODELS = modelChain(process.env.GEMINI_MODEL, ['gemini-3.5-flash', 'gemini-2.5-flash'])

const SYSTEM = `Du bist J.A.R.V.I.S. — Just A Rather Very Intelligent System — das Betriebssystem von Robertos Uhren-Resale-Geschaeft (R.O.S.).
Regeln:
- Antworte auf Deutsch, in natuerlicher gesprochener Sprache.
- Maximal 3 kurze Saetze. Keine Listen, kein Markdown, keine Sternchen, keine Emojis.
- Preise als gesprochene Zahlen nennen, zum Beispiel "3.200 Euro".
- Nutze NUR die Daten unten. Wenn etwas nicht in den Daten steht, sag ehrlich, dass du es nicht weisst.
- Tonfall: modern und direkt, freundlich-professionell. Sprich Roberto mit "Sie" an.
- Wenn eine Seite der App zur Antwort passt, beende die Antwort mit [[LINK:/pfad]]. Moeglich: /inventory (alle Artikel), /finanzen (Geld), /tempo (Schnellseller und Ladenhueter), /matrix (Plattformen), /capture (neuer Artikel). Sonst keinen Link.`

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

  const snapshot = await loadSnapshot()

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
