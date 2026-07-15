'use server'

import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing in env.local')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type AiPhotoResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export async function generateWearPhoto(itemId: string): Promise<AiPhotoResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'GEMINI_API_KEY fehlt in .env.local' }
  }

  const supabase = getAdminClient()

  // Load item
  const { data: item } = await supabase
    .from('items')
    .select('name, brand, color, material, condition_score, category_id, size')
    .eq('id', itemId)
    .single()

  if (!item) return { ok: false, error: 'Artikel nicht gefunden.' }

  // Load primary image
  const { data: primaryImage } = await supabase
    .from('item_images')
    .select('url')
    .eq('item_id', itemId)
    .eq('is_primary', true)
    .single()

  if (!primaryImage?.url) {
    return { ok: false, error: 'Kein Primärfoto vorhanden. Bitte zuerst ein Foto hochladen.' }
  }

  // Download reference image
  let imageBuffer: Buffer
  try {
    const res = await fetch(primaryImage.url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return { ok: false, error: `Foto-Download fehlgeschlagen: ${res.status}` }
    imageBuffer = Buffer.from(await res.arrayBuffer())
  } catch (e) {
    return { ok: false, error: `Foto-Download Fehler: ${(e as Error).message}` }
  }

  const base64Image = imageBuffer.toString('base64')

  // Build prompt
  const promptText = `Show exactly this ${item.brand || 'luxury'} watch from the reference image on a person's wrist. Preserve the exact same watch design, dial, color, and bracelet as shown in the reference image. Do not redesign or change any details. Natural daylight, soft shadows, professional product photography, blurred background. High detail, lifestyle wrist shot.`

  // Call Gemini 3.1 Flash Image
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${apiKey}`

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: 'image/png', data: base64Image } },
            { text: promptText }
          ]
        }],
        generationConfig: {
          responseModalities: ['IMAGE']
        }
      }),
    })
  } catch (e) {
    return { ok: false, error: `Gemini API Fehler: ${(e as Error).message}` }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { ok: false, error: body.error?.message ?? `Gemini HTTP ${res.status}` }
  }

  const data = await res.json()
  
  // Extract image from response
  const imagePart = data.candidates?.[0]?.content?.parts?.find(
    (p: any) => p.inlineData?.mimeType?.startsWith('image/')
  )
  
  if (!imagePart?.inlineData?.data) {
    return { ok: false, error: 'Kein Bild in der Gemini-Antwort gefunden.' }
  }

  const generatedBuffer = Buffer.from(imagePart.inlineData.data, 'base64')
  const mimeType = imagePart.inlineData.mimeType || 'image/jpeg'
  const ext = mimeType === 'image/png' ? 'png' : 'jpg'

  // Upload to Supabase
  const path = `${itemId}/ai-wear-${Date.now()}.${ext}`
  const { error: uploadErr } = await supabase.storage
    .from('item-images')
    .upload(path, generatedBuffer, { contentType: mimeType })

  if (uploadErr) return { ok: false, error: uploadErr.message }

  const { data: urlData } = supabase.storage.from('item-images').getPublicUrl(path)

  const { error: dbErr } = await supabase.from('item_images').insert({
    item_id: itemId,
    storage_path: path,
    url: urlData.publicUrl,
    is_primary: false,
    is_ai_generated: true,
    sort_order: 99,
  })

  if (dbErr) return { ok: false, error: dbErr.message }

  return { ok: true, url: urlData.publicUrl }
}