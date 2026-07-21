'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing in env.local')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export type CaptureResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

export async function captureItem(formData: FormData): Promise<CaptureResult> {
  const name          = (formData.get('name') as string)?.trim()
  const categoryId    = formData.get('category_id') as string
  const sourceId      = formData.get('source_id') as string
  const zoneId        = (formData.get('zone_id') as string) || null
  const purchasePrice = parseFloat(formData.get('purchase_price') as string) || 0

  if (!name)       return { ok: false, error: 'Name darf nicht leer sein.' }
  if (!categoryId) return { ok: false, error: 'Bitte Kategorie wählen.' }
  if (!sourceId)   return { ok: false, error: 'Bitte Quelle wählen.' }

  const targetPriceRaw = formData.get('target_price') as string
  const targetPrice    = targetPriceRaw ? parseFloat(targetPriceRaw) : null
  const minPriceRaw    = formData.get('min_price') as string
  const minPrice       = minPriceRaw ? parseFloat(minPriceRaw) : null

  const brand           = (formData.get('brand') as string)?.trim() || null
  const referenceNumber = (formData.get('reference_number') as string)?.trim() || null
  const yearRaw         = formData.get('year') as string
  const year            = yearRaw ? parseInt(yearRaw) : null
  const color           = (formData.get('color') as string)?.trim() || null
  const size            = (formData.get('size') as string)?.trim() || null
  const diameterRaw     = formData.get('diameter_mm') as string
  const diameterMm      = diameterRaw ? parseFloat(diameterRaw) : null
  const material        = (formData.get('material') as string)?.trim() || null
  const movement        = (formData.get('movement') as string) || null
  const conditionRaw    = formData.get('condition_score') as string
  const conditionScore  = conditionRaw ? parseInt(conditionRaw) : null
  const notes           = (formData.get('notes') as string)?.trim() || null
  const listingTitle    = (formData.get('listing_title') as string)?.trim() || null
  const listingDesc     = (formData.get('listing_description') as string)?.trim() || null

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('items')
    .insert({
      name,
      category_id:     categoryId,
      source_id:       sourceId,
      zone_id:         zoneId || undefined,
      purchase_price:  purchasePrice,
      target_price:    targetPrice,
      min_price:       minPrice,
      status:          'purchased',
      brand,
      reference_number: referenceNumber,
      year,
      color,
      size,
      diameter_mm:     diameterMm,
      material,
      movement,
      condition_score: conditionScore,
      notes,
      listing_title:       listingTitle,
      listing_description: listingDesc,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  const photos = formData.getAll('photos') as File[]
  const validPhotos = photos.filter(f => f && f.size > 0)
  for (let i = 0; i < validPhotos.length; i++) {
    const file = validPhotos[i]
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${data.id}/${Date.now()}-${i}.${ext}`
    const { error: uploadErr } = await supabase.storage
      .from('item-images')
      .upload(path, file, { contentType: file.type || 'image/jpeg' })
    if (!uploadErr) {
      const { data: urlData } = supabase.storage.from('item-images').getPublicUrl(path)
      await supabase.from('item_images').insert({
        item_id:         data.id,
        storage_path:    path,
        url:             urlData.publicUrl,
        is_primary:      i === 0,
        is_ai_generated: false,
        sort_order:      i,
      })
    }
  }

  // Neuer Artikel muss sofort in Dashboard und Inventory auftauchen,
  // nicht erst nach Ablauf des ISR-Fensters.
  revalidatePath('/')
  revalidatePath('/inventory')

  return { ok: true, id: data.id }
}