'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// /, /inventory und /matrix laufen auf ISR (revalidate = 30). Ohne diesen
// Aufruf würde router.refresh() nach einer Änderung bis zu 30s lang die alte,
// gecachte Seite liefern.
function revalidateViews(itemId?: string) {
  revalidatePath('/')
  revalidatePath('/inventory')
  revalidatePath('/matrix')
  revalidatePath('/finanzen')
  if (itemId) revalidatePath(`/items/${itemId}`)
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing in env.local')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type StatusResult =
  | { ok: true }
  | { ok: false; error: string }

/** Verkaufsdaten aus dem "Verkauft"-Dialog. Beide Felder sind optional —
 *  wer den Dialog abbricht, verkauft ohne Preis. */
export type SaleInput = {
  /** Verkaufspreis; null/undefined = nicht erfasst. */
  soldPrice?: number | null
  /** Verkaufsdatum als YYYY-MM-DD. */
  soldAt?: string | null
}

export async function updateItemStatus(
  itemId: string,
  newStatus: string,
  sale?: SaleInput
): Promise<StatusResult> {
  const validStatuses = ['purchased', 'checked', 'photographed', 'listed', 'sold']
  if (!validStatuses.includes(newStatus)) {
    return { ok: false, error: 'Ungültiger Status.' }
  }

  const supabase = getAdminClient()
  const updateData: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }
  if (newStatus === 'listed') updateData.listed_at = new Date().toISOString()
  if (newStatus !== 'listed') updateData.listed_at = null

  if (newStatus === 'sold') {
    // sold_at immer setzen — sonst fällt /finanzen auf updated_at zurück, das
    // sich bei jeder späteren Bearbeitung verschiebt. Mittag statt Mitternacht,
    // damit die Zeitzone das Datum nicht auf den Vortag kippt.
    updateData.sold_at = sale?.soldAt
      ? new Date(`${sale.soldAt}T12:00:00`).toISOString()
      : new Date().toISOString()
    // Preis nur schreiben, wenn er erfasst wurde (Abbrechen = ohne Preis).
    if (sale?.soldPrice != null && Number.isFinite(sale.soldPrice)) {
      updateData.sold_price = sale.soldPrice
    }
  } else {
    // Zurück aus "Verkauft": Verkaufsdaten entfernen, sonst rechnet /finanzen
    // weiter mit einem Verkauf, den es nicht mehr gibt.
    updateData.sold_price = null
    updateData.sold_at = null
  }

  const { error } = await supabase.from('items').update(updateData).eq('id', itemId)
  if (error) return { ok: false, error: error.message }
  revalidateViews(itemId)
  return { ok: true }
}

export async function updateImageOrder(itemId: string, imageIds: string[]): Promise<StatusResult> {
  const supabase = getAdminClient()
  await Promise.all(
    imageIds.map((id, idx) =>
      supabase.from('item_images').update({ sort_order: idx }).eq('id', id).eq('item_id', itemId)
    )
  )
  revalidateViews(itemId)
  return { ok: true }
}

export async function deleteImage(imageId: string, storagePath: string): Promise<StatusResult> {
  const supabase = getAdminClient()
  const { error: storageErr } = await supabase.storage.from('item-images').remove([storagePath])
  if (storageErr) return { ok: false, error: storageErr.message }
  const { error } = await supabase.from('item_images').delete().eq('id', imageId)
  if (error) return { ok: false, error: error.message }
  revalidateViews()
  return { ok: true }
}

export async function setPrimaryImage(itemId: string, imageId: string): Promise<StatusResult> {
  const supabase = getAdminClient()
  await supabase.from('item_images').update({ is_primary: false }).eq('item_id', itemId)
  const { error } = await supabase.from('item_images').update({ is_primary: true }).eq('id', imageId)
  if (error) return { ok: false, error: error.message }
  revalidateViews(itemId)
  return { ok: true }
}

export type AiAdviceResult =
  | { tips: { icon: string; text: string }[] }
  | { error: string }

export async function getAiAdvice(itemId: string): Promise<AiAdviceResult> {
  const supabase = getAdminClient()
  const { data: item } = await supabase.from('items').select('*').eq('id', itemId).single()
  if (!item) return { error: 'Artikel nicht gefunden.' }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { error: 'OpenAI API Key fehlt.' }

  const prompt = `Du bist ein erfahrener Reseller-Berater für den deutschen Markt (Kleinanzeigen, Vinted, eBay).
Analysiere diesen Artikel und gib 4-6 konkrete, spezifische Verkaufstipps:

Artikel: ${item.name}
Kategorie: ${item.category_id}
Marke: ${item.brand || 'unbekannt'}
EK: €${item.purchase_price}
Wunschpreis: €${item.target_price || 'nicht gesetzt'}
Minimalpreis: €${item.min_price || 'nicht gesetzt'}
Zustand: ${item.condition_score ? `${item.condition_score}/10` : 'nicht angegeben'}
Status: ${item.status}${item.notes ? `\nNotizen: ${item.notes}` : ''}

Antworte mit einem JSON-Array: [{"icon": "✅" oder "⚠", "text": "Tipp-Text"}]
✅ für positive Aspekte/Chancen, ⚠ für Risiken/Verbesserungsmöglichkeiten.
Antworte NUR mit dem JSON-Array, ohne weiteren Text oder Markdown.`

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.7,
    }),
  })

  const json = await resp.json()
  const text = (json.choices?.[0]?.message?.content ?? '').trim()
  try {
    const tips = JSON.parse(text)
    return { tips }
  } catch {
    return { error: 'KI-Antwort konnte nicht verarbeitet werden.' }
  }
}
