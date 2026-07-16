'use server'

import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function savePlatformStats(formData: FormData) {
  const account    = (formData.get('account')    as string) || ''
  const week_start = (formData.get('week_start') as string) || ''
  const views      = Math.max(0, parseInt(formData.get('views')  as string) || 0)
  const clicks     = Math.max(0, parseInt(formData.get('clicks') as string) || 0)
  const likes      = Math.max(0, parseInt(formData.get('likes')  as string) || 0)
  const dms        = Math.max(0, parseInt(formData.get('dms')    as string) || 0)
  const saved      = Math.max(0, parseInt(formData.get('saved')  as string) || 0)

  const supabase = getAdminClient()
  const { error } = await supabase
    .from('platform_stats')
    .upsert(
      { account, week_start, views, clicks, likes, dms, saved },
      { onConflict: 'account,week_start' }
    )

  if (error) throw new Error(error.message)

  redirect(`/platform/${account}`)
}
