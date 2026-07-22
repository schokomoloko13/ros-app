import { NextRequest, NextResponse } from 'next/server'

// JARVIS Stimme v2 (/api/jarvis/speak) — Text → natürliche Sprache (WAV).
// Akzentfreies Hochdeutsch per Stil-Anweisung. Stimme kommt vom Client
// (Whitelist) oder aus GEMINI_TTS_VOICE, Standard: Charon.
export const dynamic = 'force-dynamic'

const TTS_MODEL = process.env.GEMINI_TTS_MODEL ?? 'gemini-2.5-flash-preview-tts'
const DEFAULT_VOICE = process.env.GEMINI_TTS_VOICE ?? 'Charon'
const ALLOWED_VOICES = ['Charon', 'Fenrir', 'Orus', 'Kore', 'Algieba']

const STYLE = 'Sprich klares, akzentfreies Hochdeutsch, ruhig und souverän, mit der leicht trockenen Würde eines britischen Butlers: '

function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

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
  const text = String(body?.text ?? '').trim().slice(0, 1500)
  if (!text) return NextResponse.json({ error: 'Kein Text.' }, { status: 400 })

  const reqVoice = String(body?.voice ?? '')
  const voice = ALLOWED_VOICES.includes(reqVoice) ? reqVoice : DEFAULT_VOICE

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: STYLE + text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
      }),
    }
  )

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return NextResponse.json({ error: `TTS-Fehler ${res.status}: ${detail.slice(0, 300)}` }, { status: 502 })
  }

  const json = await res.json()
  const part = json?.candidates?.[0]?.content?.parts?.[0]
  const b64: string | undefined = part?.inlineData?.data ?? part?.inline_data?.data
  if (!b64) {
    return NextResponse.json({ error: 'Kein Audio vom Modell.' }, { status: 502 })
  }

  const wav = pcmToWav(Buffer.from(b64, 'base64'))
  return new NextResponse(new Uint8Array(wav), {
    headers: {
      'Content-Type': 'audio/wav',
      'Cache-Control': 'no-store',
    },
  })
}
