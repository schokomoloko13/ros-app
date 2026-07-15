'use server'

export type GenerateResult =
  | { ok: true;  title: string; description: string }
  | { ok: false; error: string }

export async function generateListingText(
  ctx: Record<string, string>
): Promise<GenerateResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey.startsWith('sk-YOUR')) {
    return { ok: false, error: 'OPENAI_API_KEY fehlt in .env.local — bitte eintragen und Server neu starten.' }
  }

  const lines = [
    ctx.name             && `Artikel: ${ctx.name}`,
    ctx.brand            && `Marke: ${ctx.brand}`,
    ctx.reference_number && `Referenz: ${ctx.reference_number}`,
    ctx.year             && `Baujahr: ${ctx.year}`,
    ctx.color            && `Farbe: ${ctx.color}`,
    ctx.size             && `Größe: ${ctx.size}`,
    ctx.diameter_mm      && `Durchmesser: ${ctx.diameter_mm}mm`,
    ctx.material         && `Material: ${ctx.material}`,
    ctx.movement         && `Uhrwerk: ${ctx.movement}`,
    ctx.condition_score  && `Zustand: ${ctx.condition_score}/10`,
    ctx.notes            && `Notizen: ${ctx.notes}`,
  ].filter(Boolean).join('\n')

  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Du bist ein Experte für Resale-Inserate auf Kleinanzeigen und Vinted. ' +
              'Schreibe präzise, seriöse, deutschsprachige Inserat-Texte. ' +
              'Hebe wichtige Merkmale hervor, nenne den Zustand ehrlich. Keine Emojis, kein Clickbait.',
          },
          {
            role: 'user',
            content:
              `Erstelle für diesen Artikel:\n` +
              `1. Einen Titel (maximal 70 Zeichen, keyword-reich, für Kleinanzeigen)\n` +
              `2. Eine Beschreibung (150–250 Wörter, strukturiert, informativ)\n\n` +
              `${lines}\n\n` +
              `Antworte exakt in diesem Format – nichts anderes:\n` +
              `TITEL: [titel]\n` +
              `BESCHREIBUNG:\n[beschreibung]`,
          },
        ],
        max_tokens: 700,
        temperature: 0.65,
      }),
    })
  } catch (e) {
    return { ok: false, error: `Netzwerkfehler: ${(e as Error).message}` }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { ok: false, error: body.error?.message ?? `OpenAI HTTP ${res.status}` }
  }

  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''

  const titleMatch = text.match(/^TITEL:\s*(.+)/m)
  const descMatch  = text.match(/BESCHREIBUNG:\s*([\s\S]+)/i)

  return {
    ok:          true,
    title:       (titleMatch?.[1] ?? '').trim(),
    description: (descMatch?.[1]  ?? text).trim(),
  }
}
