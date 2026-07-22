import { NextResponse } from 'next/server'
import { loadSnapshot } from '../snapshot'

// JARVIS Sprach-Gespräch (/api/jarvis/realtime) — stellt ein Kurzzeit-Ticket aus.
// Der Browser baut damit eine direkte WebRTC-Audioleitung zu OpenAI auf: Sprache
// rein, Sprache raus, unterbrechbar. Der echte API-Schlüssel bleibt hier auf dem
// Server und wird nie ausgeliefert; das Ticket läuft nach wenigen Minuten ab.
export const dynamic = 'force-dynamic'

const MODEL = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime-2.1-mini'
const VOICE = process.env.OPENAI_REALTIME_VOICE ?? 'cedar'

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
- Eröffne das Gespräch von dir aus mit einem knappen Tages-Briefing: was heute wichtig ist, in zwei bis drei Sätzen. Danach wartest du auf seine Fragen.`

export async function POST() {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'OPENAI_API_KEY fehlt.' }, { status: 500 })
  }

  const snapshot = await loadSnapshot()
  const heute = new Date().toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      session: {
        type: 'realtime',
        model: MODEL,
        instructions: `${SYSTEM}\n\nHEUTE IST ${heute}.\n\nAKTUELLE DATEN (Stand jetzt):\n${snapshot}`,
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
