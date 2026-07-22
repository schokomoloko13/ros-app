import { NextRequest, NextResponse } from 'next/server'
import { extractText, generateContent, modelChain } from '../gemini'

// JARVIS Gehör (/api/jarvis/listen) — Audio → Text über Gemini.
// Browser-unabhängig (kein Chrome-Sprachdienst nötig), läuft auch auf iOS.
// Nimmt base64-Audio (webm/opus oder mp4/aac), gibt das Transkript zurück.
export const dynamic = 'force-dynamic'

const MODELS = modelChain(process.env.GEMINI_MODEL, ['gemini-3.5-flash', 'gemini-2.5-flash'])

const PROMPT = 'Du bekommst eine deutsche Sprachnachricht. Transkribiere sie wörtlich. Antworte ausschließlich mit dem gesprochenen Text, ohne Anführungszeichen und ohne Kommentar. Wenn nichts Verständliches gesagt wurde, antworte genau mit: [unverstaendlich]'

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'GEMINI_API_KEY fehlt.' }, { status: 500 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
  }

  const audio = String(body?.audio ?? '')
  const mime = String(body?.mime ?? 'audio/webm')
  if (!audio) return NextResponse.json({ error: 'Kein Audio.' }, { status: 400 })
  if (audio.length > 9_000_000) {
    return NextResponse.json({ error: 'Aufnahme zu lang.' }, { status: 413 })
  }

  const { res, model } = await generateContent(MODELS, key, {
    contents: [{
      parts: [
        { inlineData: { mimeType: mime, data: audio } },
        { text: PROMPT },
      ],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 300,
      // Transkribieren ist Fleißarbeit — Nachdenken kostet nur Zeit und Token-Budget.
      thinkingConfig: { thinkingBudget: 0 },
    },
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return NextResponse.json(
      { error: `Hör-Fehler ${res.status} (${model}): ${detail.slice(0, 300)}` },
      { status: 502 }
    )
  }

  const json = await res.json()
  const transcript = extractText(json)
  if (!transcript || transcript === '[unverstaendlich]') {
    return NextResponse.json({ transcript: '' })
  }
  return NextResponse.json({ transcript })
}
