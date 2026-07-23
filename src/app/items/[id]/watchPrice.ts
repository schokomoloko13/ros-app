'use server'

import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase-Konfiguration fehlt in .env.local')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ── Feste Auswahlwerte (Deckungsgleich mit den DB-Check-Constraints) ───────

export const SHAPE_OPTIONS = ['Rund', 'Eckig/Rechteckig', 'Tonneau', 'Oval', 'Kissen/Cushion', 'Sonstige']
export const GENDER_OPTIONS = ['Herren', 'Damen', 'Unisex']

/** Freitext der KI grob auf einen erlaubten Formwert abbilden ('' = unbekannt). */
function normalizeShape(raw: string): string {
  const s = raw.toLowerCase()
  if (!s) return ''
  if (SHAPE_OPTIONS.some((o) => o.toLowerCase() === s)) {
    return SHAPE_OPTIONS.find((o) => o.toLowerCase() === s)!
  }
  if (s.includes('rund') || s.includes('round') || s.includes('kreis')) return 'Rund'
  if (s.includes('tonneau') || s.includes('fass')) return 'Tonneau'
  if (s.includes('oval')) return 'Oval'
  if (s.includes('kissen') || s.includes('cushion')) return 'Kissen/Cushion'
  if (s.includes('eck') || s.includes('recht') || s.includes('square') || s.includes('rectang') || s.includes('quadrat')) return 'Eckig/Rechteckig'
  return ''
}

/** Freitext der KI grob auf Herren/Damen/Unisex abbilden ('' = unbekannt). */
function normalizeGender(raw: string): string {
  const s = raw.toLowerCase()
  if (!s) return ''
  if (s.includes('herr') || s.includes('men') || s.includes('männ') || s.includes('gent')) return 'Herren'
  if (s.includes('dam') || s.includes('women') || s.includes('lad') || s.includes('frau')) return 'Damen'
  if (s.includes('uni')) return 'Unisex'
  return ''
}

// ── Schritt 1: Uhr aus Fotos erkennen ─────────────────────────────────────

export type WatchDetection = {
  brand: string
  model: string
  reference: string
  year: string
  caliber: string
  shape: string // einer aus SHAPE_OPTIONS oder ''
  gender: string // einer aus GENDER_OPTIONS oder ''
  condition: string
  notable: string
  confidence: number // 0..1
  hint: string // z.B. "Referenz unklar" — leer wenn nichts auffällt
}

export type DetectResult =
  | { ok: true; detection: WatchDetection }
  | { ok: false; error: string }

/** Bilder als data:-URLs (Upload) oder öffentliche URLs (vorhandene Fotos). */
export async function detectWatch(images: string[]): Promise<DetectResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey.startsWith('sk-YOUR')) {
    return { ok: false, error: 'OPENAI_API_KEY fehlt in .env.local.' }
  }
  const pics = images.filter(Boolean).slice(0, 3)
  if (pics.length === 0) return { ok: false, error: 'Kein Foto ausgewählt.' }

  const prompt =
    'Du bist ein Uhren-Sachverständiger. Analysiere die Fotos dieser Armbanduhr und ' +
    'bestimme so präzise wie möglich die Identität. Rate NICHT wild — wenn ein Feld ' +
    'nicht erkennbar ist, lass es leer. Antworte NUR mit JSON in exakt diesem Schema:\n' +
    '{\n' +
    '  "brand": "Marke",\n' +
    '  "model": "Modellname/-linie",\n' +
    '  "reference": "Referenznummer falls lesbar, sonst leer",\n' +
    '  "year": "ungefähres Baujahr/Epoche, sonst leer",\n' +
    '  "caliber": "Kaliber/Uhrwerk falls erkennbar, sonst leer",\n' +
    '  "shape": "Gehäuseform, EXAKT einer von: Rund, Eckig/Rechteckig, Tonneau, Oval, Kissen/Cushion, Sonstige; sonst leer",\n' +
    '  "gender": "Zielgruppe, EXAKT einer von: Herren, Damen, Unisex; im Zweifel Unisex",\n' +
    '  "condition": "kurzer Zustandseindruck (z.B. getragen, Kratzer am Glas)",\n' +
    '  "notable": "Besonderheiten (Zifferblattfarbe, Komplikationen, Box/Papiere sichtbar)",\n' +
    '  "confidence": 0.0-1.0,\n' +
    '  "hint": "kurzer Hinweis wenn etwas zweifelhaft ist, z.B. Referenz unklar; sonst leer"\n' +
    '}'

  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        max_tokens: 700,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...pics.map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          },
        ],
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
  try {
    const raw = JSON.parse(text)
    const detection: WatchDetection = {
      brand: String(raw.brand ?? '').trim(),
      model: String(raw.model ?? '').trim(),
      reference: String(raw.reference ?? '').trim(),
      year: String(raw.year ?? '').trim(),
      caliber: String(raw.caliber ?? '').trim(),
      shape: normalizeShape(String(raw.shape ?? '').trim()),
      gender: normalizeGender(String(raw.gender ?? '').trim()),
      condition: String(raw.condition ?? '').trim(),
      notable: String(raw.notable ?? '').trim(),
      confidence: Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : 0.5,
      hint: String(raw.hint ?? '').trim(),
    }
    return { ok: true, detection }
  } catch {
    return { ok: false, error: 'KI-Antwort konnte nicht verarbeitet werden.' }
  }
}

// ── Schritt 2: Marktpreis aus verkauften Exemplaren recherchieren ──────────

export type PriceSample = {
  price: number | null
  date: string
  url: string
  title: string
}

export type PriceResearch = {
  soldMedian: number | null
  soldMin: number | null
  soldMax: number | null
  sampleCount: number
  samples: PriceSample[]
  source: string // z.B. "ebay_sold_via_websuche"
  confidence: 'gut' | 'unsicher'
  note: string
}

export type ResearchResult =
  | { ok: true; research: PriceResearch; priceCheckId: string | null }
  | { ok: false; error: string }

export type ConfirmedWatch = {
  brand: string
  model: string
  reference: string
  year?: string
  itemId?: string | null
}

function extractJson(text: string): any | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

function median(nums: number[]): number | null {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (xs.length === 0) return null
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2)
}

export async function researchPrice(watch: ConfirmedWatch): Promise<ResearchResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey.startsWith('sk-YOUR')) {
    return { ok: false, error: 'OPENAI_API_KEY fehlt in .env.local.' }
  }

  const label = [watch.brand, watch.model, watch.reference].filter(Boolean).join(' ').trim()
  if (!label) return { ok: false, error: 'Keine Modelldaten für die Suche.' }

  const query =
    `Recherchiere den realen Marktwert dieser Armbanduhr: ${label}` +
    (watch.year ? ` (ca. ${watch.year})` : '') + '.\n\n' +
    'WICHTIG: Nutze ausschließlich TATSÄCHLICH VERKAUFTE Exemplare — primär eBay ' +
    '"Verkaufte Artikel" / completed & sold listings für genau dieses Modell und, wenn ' +
    'vorhanden, diese Referenznummer. Verwende KEINE Angebotspreise von Chrono24 oder ' +
    'aktiven/laufenden eBay-Inseraten. Preise in Euro (EUR); rechne andere Währungen grob um.\n\n' +
    'Gib danach NUR ein JSON-Objekt zurück (in ```json ...``` gefasst) mit exakt diesem Schema:\n' +
    '{\n' +
    '  "samples": [ { "price": 1234, "date": "YYYY-MM-DD oder Zeitraum", "url": "Link zum verkauften Artikel", "title": "kurzer Titel" } ],\n' +
    '  "source": "ebay_sold" | "gemischt",\n' +
    '  "note": "kurzer Hinweis, z.B. wenig Daten"\n' +
    '}\n' +
    'Liefere 3-5 konkrete verkaufte Beispiele mit Preis, Datum und Link. Wenn du weniger ' +
    'als 3 echte Verkäufe findest, gib trotzdem was du hast und schreibe in "note" ' +
    'ausdrücklich "wenig Daten, Einschätzung unsicher".'

  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        tools: [{ type: 'web_search_preview' }],
        input: query,
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
  // Responses-API: Text aus output[].content[] mit type "output_text" zusammensetzen.
  let text = ''
  if (typeof data.output_text === 'string') {
    text = data.output_text
  } else if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item?.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c?.type === 'output_text' && typeof c.text === 'string') text += c.text + '\n'
        }
      }
    }
  }

  const parsed = extractJson(text)
  if (!parsed) return { ok: false, error: 'Preis-Recherche lieferte kein verwertbares Ergebnis.' }

  const rawSamples: any[] = Array.isArray(parsed.samples) ? parsed.samples : []
  const samples: PriceSample[] = rawSamples.slice(0, 8).map((s) => {
    const priceNum = typeof s.price === 'number'
      ? s.price
      : parseFloat(String(s.price ?? '').replace(/[^\d.,]/g, '').replace(',', '.'))
    return {
      price: Number.isFinite(priceNum) ? Math.round(priceNum) : null,
      date: String(s.date ?? '').trim(),
      url: String(s.url ?? '').trim(),
      title: String(s.title ?? '').trim(),
    }
  })

  const prices = samples.map((s) => s.price).filter((p): p is number => p != null)
  const soldMedian = median(prices)
  const soldMin = prices.length ? Math.min(...prices) : null
  const soldMax = prices.length ? Math.max(...prices) : null
  const sampleCount = prices.length
  const lowData = sampleCount < 3

  const research: PriceResearch = {
    soldMedian,
    soldMin,
    soldMax,
    sampleCount,
    samples,
    source: String(parsed.source ?? 'ebay_sold') + '_via_websuche',
    confidence: lowData ? 'unsicher' : 'gut',
    note: lowData
      ? (String(parsed.note ?? '').trim() || 'wenig Daten, Einschätzung unsicher')
      : String(parsed.note ?? '').trim(),
  }

  // In price_checks speichern (Historie).
  let priceCheckId: string | null = null
  try {
    const supabase = getAdminClient()
    const { data: inserted } = await supabase
      .from('price_checks')
      .insert({
        item_id: watch.itemId ?? null,
        brand: watch.brand || null,
        model: watch.model || null,
        reference: watch.reference || null,
        sold_median: research.soldMedian,
        sold_min: research.soldMin,
        sold_max: research.soldMax,
        sample_count: research.sampleCount,
        sources: research.samples,
      })
      .select('id')
      .single()
    priceCheckId = inserted?.id ?? null
  } catch {
    // Speichern optional — Ergebnis trotzdem anzeigen.
  }

  return { ok: true, research, priceCheckId }
}

// ── Optional: erkannte + recherchierte Werte in den Artikel übernehmen ─────

const MOVEMENTS = ['Automatik', 'Handaufzug', 'Quartz', 'Elektronisch', 'Sonstiges']

export type ApplyResult = { ok: true } | { ok: false; error: string }

export async function applyWatchValues(
  itemId: string,
  values: { brand?: string; reference?: string; year?: string; caliber?: string; shape?: string; gender?: string; targetPrice?: number | null }
): Promise<ApplyResult> {
  const supabase = getAdminClient()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (values.brand) update.brand = values.brand
  if (values.reference) update.reference_number = values.reference
  const yearNum = values.year ? parseInt(values.year.replace(/[^\d]/g, ''), 10) : NaN
  if (Number.isFinite(yearNum) && yearNum > 1800 && yearNum < 2100) update.year = yearNum
  // Nur gültige Enum-Werte schreiben — sonst schlägt die DB-Check-Constraint an.
  const shape = values.shape ? normalizeShape(values.shape) : ''
  if (shape && SHAPE_OPTIONS.includes(shape)) update.shape = shape
  const gender = values.gender ? normalizeGender(values.gender) : ''
  if (gender && GENDER_OPTIONS.includes(gender)) update.gender = gender
  // Kaliber grob auf das erlaubte movement-Enum mappen, sonst nicht anfassen.
  if (values.caliber) {
    const lc = values.caliber.toLowerCase()
    const guess = lc.includes('quar') ? 'Quartz'
      : lc.includes('hand') || lc.includes('manual') ? 'Handaufzug'
      : lc.includes('auto') ? 'Automatik' : null
    if (guess && MOVEMENTS.includes(guess)) update.movement = guess
  }
  if (values.targetPrice != null && Number.isFinite(values.targetPrice)) {
    update.target_price = values.targetPrice
  }

  const { error } = await supabase.from('items').update(update).eq('id', itemId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
