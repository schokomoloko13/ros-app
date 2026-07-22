// Jarvis Tages-Briefing — läuft jeden Morgen um 07:00 UTC (09:00 CET).
// Liest Bestand, Ausgaben und Plattform-Signale, lässt GPT-4o-mini
// ein 2-3-Satz-Briefing auf Deutsch formulieren und speichert es in
// jarvis_briefings. realtime/route.ts liest es beim nächsten Connect.
import { createClient } from '@supabase/supabase-js'
import type { Config } from '@netlify/functions'

export const config: Config = {
  schedule: '0 7 * * *',
}

const DAY = 86_400_000

function days(d?: string | null): number {
  return d ? Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / DAY)) : 0
}

function euro(n: number): string {
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits: 0 })
}

export default async (): Promise<Response> => {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const oKey = process.env.OPENAI_API_KEY

  if (!url || !key || !oKey) {
    console.error('jarvis-daily: fehlende Umgebungsvariablen')
    return new Response('config error', { status: 500 })
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const today = new Date().toISOString().slice(0, 10)

  // Bereits generiert? → abbrechen (Idempotenz bei Retry).
  const { data: existing } = await supabase
    .from('jarvis_briefings')
    .select('id')
    .eq('briefing_date', today)
    .maybeSingle()
  if (existing) return new Response('already done', { status: 200 })

  // ── Daten laden ───────────────────────────────────────────────────

  const [{ data: items }, { data: metrics }] = await Promise.all([
    supabase
      .from('items')
      .select('id, name, brand, status, target_price, sold_price, sold_at, listed_at, purchase_date, created_at')
      .order('created_at', { ascending: false })
      .limit(400),
    supabase
      .from('platform_metrics')
      .select('item_id, platform, views, watchers, messages, platform_status, scanned_at')
      .not('item_id', 'is', null)
      .order('scanned_at', { ascending: false })
      .limit(400),
  ])

  const all = items || []

  // Monatszahlen
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const sold       = all.filter(i => i.status === 'sold')
  const monthSales = sold.filter(i => i.sold_at && i.sold_at >= monthStart)
  const monthRev   = monthSales.reduce((s, i) => s + Number(i.sold_price ?? i.target_price ?? 0), 0)

  // Ladenhüter
  const ladenhüter = all
    .filter(i => i.status === 'listed' && days(i.listed_at ?? i.created_at) > 30)
    .sort((a, b) => days(b.listed_at ?? b.created_at) - days(a.listed_at ?? a.created_at))
    .slice(0, 5)

  // Plattform-Signale — neuester Scan pro Artikel
  const latestMetrics = new Map<string, { ka?: any; vinted?: any }>()
  for (const m of metrics || []) {
    if (!m.item_id) continue
    const e = latestMetrics.get(m.item_id) || {}
    if (m.platform === 'kleinanzeigen' && !e.ka)    e.ka     = m
    if (m.platform === 'vinted'        && !e.vinted) e.vinted = m
    latestMetrics.set(m.item_id, e)
  }

  const topByViews = [...latestMetrics.entries()]
    .map(([itemId, m]) => ({
      name:     all.find(i => i.id === itemId)?.name ?? 'Artikel',
      views:    (m.ka?.views    || 0) + (m.vinted?.views    || 0),
      watchers: (m.ka?.watchers || 0) + (m.vinted?.watchers || 0),
      msgs:     m.ka?.messages || 0,
    }))
    .filter(e => e.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, 4)

  // Viele Beobachter, null Anfragen → Preis zu hoch?
  const beobachtetOhneKontakt = [...latestMetrics.entries()]
    .map(([itemId, m]) => ({
      name:     all.find(i => i.id === itemId)?.name ?? 'Artikel',
      watchers: (m.ka?.watchers || 0) + (m.vinted?.watchers || 0),
      msgs:     m.ka?.messages || 0,
    }))
    .filter(e => e.watchers >= 5 && e.msgs === 0)
    .sort((a, b) => b.watchers - a.watchers)
    .slice(0, 3)

  const wartend = all.filter(i => ['purchased', 'checked', 'photographed'].includes(i.status))

  // Kompaktes Daten-Summary für GPT
  const wochentag = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
  const lines = [
    `DATUM: ${wochentag}`,
    `MONAT: ${monthSales.length} Verkäufe · ${euro(monthRev)} € Umsatz`,
    `BESTAND: ${all.filter(i => i.status !== 'sold').length} aktive Artikel · ${wartend.length} noch nicht online`,
    ladenhüter.length
      ? `LADENHÜTER: ${ladenhüter.map(i => `${i.name} (${days(i.listed_at ?? i.created_at)} Tage)`).join(', ')}`
      : 'LADENHÜTER: keine',
    topByViews.length
      ? `AUFRUFE: ${topByViews.map(e => `${e.name} ${e.views} Aufrufe · ${e.msgs} Anfragen`).join(' | ')}`
      : '',
    beobachtetOhneKontakt.length
      ? `BEOBACHTET OHNE ANFRAGE: ${beobachtetOhneKontakt.map(e => `${e.name} (${e.watchers} Beobachter)`).join(', ')}`
      : '',
  ].filter(Boolean).join('\n')

  // GPT-Briefing generieren
  const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${oKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:       'gpt-4o-mini',
      temperature: 0.55,
      max_tokens:  220,
      messages: [
        {
          role: 'system',
          content:
            'Du bist J.A.R.V.I.S., das Betriebssystem von Robertos Uhren-Resale-Geschäft R.O.S. ' +
            'Schreibe ein tägliches Morgen-Briefing für Roberto: 2-3 prägnante Sätze auf Hochdeutsch. ' +
            'Priorisiere das Dringlichste: was braucht heute Aufmerksamkeit, was stagniert, was läuft gut. ' +
            'Kurze Sätze. Keine Aufzählungen. Keine Emojis. Kein Butler-Ton. Direkt wie ein guter Kollege.',
        },
        { role: 'user', content: `Aktuelle Lage:\n${lines}\n\nBriefing:` },
      ],
    }),
  })

  if (!gptRes.ok) {
    console.error('jarvis-daily: OpenAI Fehler', gptRes.status)
    return new Response('openai error', { status: 502 })
  }

  const gptJson = await gptRes.json()
  const text    = (gptJson.choices?.[0]?.message?.content ?? '').trim()
  if (!text) return new Response('no text from gpt', { status: 500 })

  const { error } = await supabase.from('jarvis_briefings').insert({ briefing_date: today, text })
  if (error) {
    console.error('jarvis-daily: Supabase Fehler', error.message)
    return new Response('db error', { status: 500 })
  }

  console.log(`jarvis-daily: Briefing ${today} gespeichert — "${text.slice(0, 80)}…"`)
  return new Response('ok', { status: 200 })
}
