import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadSnapshot } from '../snapshot'
import { JARVIS_WERKZEUGE, WERKZEUG_REGELN } from '../werkzeuge'

async function loadTodaysBriefing(): Promise<string | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('jarvis_briefings')
    .select('text')
    .eq('briefing_date', today)
    .maybeSingle()
  return data?.text ?? null
}

// JARVIS Sprach-Gespräch (/api/jarvis/realtime) — stellt ein Kurzzeit-Ticket aus.
// Der Browser baut damit eine direkte WebRTC-Audioleitung zu OpenAI auf: Sprache
// rein, Sprache raus, unterbrechbar. Der echte API-Schlüssel bleibt hier auf dem
// Server und wird nie ausgeliefert; das Ticket läuft nach wenigen Minuten ab.
export const dynamic = 'force-dynamic'

const MODEL = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime-2.1-mini'
const VOICE = process.env.OPENAI_REALTIME_VOICE ?? 'ash'

// Jarvis schwebt auf jeder Seite mit — er soll wissen, wo Roberto gerade steht.
const SEITEN: Record<string, string> = {
  '/': 'dem Command Center (Tagesüberblick)',
  '/inventory': 'der Bestandsliste',
  '/finanzen': 'der Finanzseite (Ausgaben, Umsatz, Monatslauf)',
  '/tempo': 'der Tempo-Seite (Schnellseller und Ladenhüter)',
  '/matrix': 'der Plattform-Matrix',
  '/capture': 'dem Anlegen eines neuen Artikels',
  '/schaufenster': 'dem Schaufenster',
}

function seitenHinweis(pfad: string): string {
  if (pfad.startsWith('/items/')) {
    return 'Roberto ist gerade bei einem einzelnen Artikel. Fragen zu "diesem Artikel" beziehen sich wahrscheinlich darauf.'
  }
  const ort = SEITEN[pfad]
  return ort ? `Roberto ist gerade auf ${ort}. Beziehe dich darauf, wenn er ohne Nennung "hier" oder "das" sagt.` : ''
}

const SYSTEM = `Du bist J.A.R.V.I.S., das Betriebssystem von Robertos Uhren-Resale-Geschäft (R.O.S.). Du sprichst mit Roberto.

So klingst du:
- Klares, akzentfreies Hochdeutsch in normalem Gesprächstempo. Nicht feierlich, nicht gedehnt.
- Modern und direkt, wie ein guter Kollege: freundlich, aber ohne Floskeln und ohne Butler-Pathos.
- Kurze Sätze. Meistens zwei, höchstens drei. Du wirst gehört, nicht gelesen.
- Keine Aufzählungen, keine Sternchen, keine Emojis, kein Markdown.
- Preise sprichst du aus, zum Beispiel "dreitausendzweihundert Euro".
- Sprich Roberto mit "Sie" an, aber locker.

Regeln:
- Nutze NUR die Daten unten. Was da nicht steht, weißt du nicht — dann sag das kurz.
- Wenn Roberto dich unterbricht, hör sofort auf und geh auf das Neue ein.
- Du bist auf jeder Seite der App erreichbar und hilfst überall: Bestand, Verkäufe, Ladenhüter, Ausgaben und Finanz-Zusammenfassungen.
- Eröffne das Gespräch von dir aus mit zwei bis drei Sätzen zu dem, was auf der Seite gerade relevant ist, auf der Roberto steht. Danach wartest du auf seine Fragen.`

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'OPENAI_API_KEY fehlt.' }, { status: 500 })
  }

  let pfad = '/'
  try {
    const body = await req.json()
    pfad = String(body?.pfad ?? '/').slice(0, 120)
  } catch { /* ohne Angabe bleibt es das Command Center */ }

  const [snapshot, briefing] = await Promise.all([loadSnapshot(), loadTodaysBriefing()])
  const heute = new Date().toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const briefingBlock = briefing
    ? `\n\nTAGES-BRIEFING (heute von dir vorbereitet — damit das Gespräch eröffnen, kurz und direkt):\n${briefing}`
    : ''

  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      session: {
        type: 'realtime',
        model: MODEL,
        instructions: `${SYSTEM}\n${WERKZEUG_REGELN}\n\nHEUTE IST ${heute}.\n${seitenHinweis(pfad)}${briefingBlock}\n\nAKTUELLE DATEN (Stand jetzt):\n${snapshot}`,
        tools: JARVIS_WERKZEUGE,
        tool_choice: 'auto',
        audio: {
          input: {
            // Satzende erkennt der Server selbst — kein zweiter Mikro-Klick nötig.
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
              create_response: true,
              interrupt_response: true,
            },
          },
          // Etwas über Normaltempo: wach, aber noch gut verständlich.
          output: { voice: VOICE, speed: 1.1 },
        },
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return NextResponse.json(
      { error: `Sprach-Verbindung abgelehnt (${res.status}): ${detail.slice(0, 200)}` },
      { status: 502 }
    )
  }

  const json = await res.json()
  const token: string | undefined = json?.value
  if (!token) {
    return NextResponse.json({ error: 'Kein Ticket erhalten.' }, { status: 502 })
  }

  return NextResponse.json({ token, model: MODEL }, { headers: { 'Cache-Control': 'no-store' } })
}
