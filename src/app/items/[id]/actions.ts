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

export type StatusResult =
  | { ok: true }
  | { ok: false; error: string }

export async function updateItemStatus(itemId: string, newStatus: string): Promise<StatusResult> {
  const validStatuses = ['purchased', 'checked', 'photographed', 'listed', 'sold']
  if (!validStatuses.includes(newStatus)) {
    return { ok: false, error: 'Ungültiger Status.' }
  }

  const supabase = getAdminClient()
  
  // Build update object
  const updateData: Record<string, any> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }
  
  // Set listed_at when status becomes "listed"
  if (newStatus === 'listed') {
    updateData.listed_at = new Date().toISOString()
  }
  
  // Clear listed_at when status moves away from "listed"
  if (newStatus !== 'listed') {
    updateData.listed_at = null
  }

  const { error } = await supabase
    .from('items')
    .update(updateData)
    .eq('id', itemId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}