// Gemini-Modellwahl mit Fallback-Kette.
// Google schaltet Modelle ab (gemini-2.0-flash: 01.06.2026) und hatte im Juli 2026
// kurzzeitige 404er auf laufenden Modellen. Darum: bei 404 automatisch das nächste
// Modell der Kette versuchen, statt Jarvis stumm zu schalten.

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

/** Optionales Override (GEMINI_MODEL / GEMINI_TTS_MODEL) vorne anstellen, Duplikate raus. */
export function modelChain(override: string | undefined, defaults: string[]): string[] {
  const wanted = (override ?? '').trim()
  return [...new Set(wanted ? [wanted, ...defaults] : defaults)]
}

export type GeminiCall = {
  res: Response
  /** Modell, das tatsächlich geantwortet hat — für Fehlermeldungen. */
  model: string
}

/** Ruft generateContent der Reihe nach auf; 404 (Modell weg) → nächstes Modell. */
export async function generateContent(
  models: string[],
  key: string,
  payload: unknown,
): Promise<GeminiCall> {
  let last: GeminiCall | null = null
  for (const model of models) {
    const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(payload),
    })
    if (res.status !== 404) return { res, model }
    last = { res, model }
  }
  return last as GeminiCall
}

/**
 * Text aus einer Antwort ziehen. Denkende Modelle (3.x) liefern mehrere Parts,
 * darunter Gedanken-Parts — die gehören nicht in Jarvis' Mund.
 */
export function extractText(json: any): string {
  const parts = json?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((p: any) => !p?.thought && typeof p?.text === 'string')
    .map((p: any) => p.text)
    .join('')
    .trim()
}

/** Audio-Part (base64 PCM) aus einer TTS-Antwort ziehen. */
export function extractAudio(json: any): { data: string; mime: string } | null {
  const parts = json?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return null
  for (const p of parts) {
    const inline = p?.inlineData ?? p?.inline_data
    const data = inline?.data
    if (data) return { data, mime: String(inline?.mimeType ?? inline?.mime_type ?? '') }
  }
  return null
}
