import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

// Gegenstück zum M3.5-Writeback der Extension, für Posts vom Handy.
// Server-seitig mit Service-Key → unabhängig von RLS-Policies.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const PLATFORMS = new Set(['kleinanzeigen', 'vinted'])

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const platform = String(body?.platform || '')

    if (!PLATFORMS.has(platform)) {
      return NextResponse.json({ ok: false, error: 'unbekannte Plattform' }, { status: 400 })
    }

    const now = new Date().toISOString()

    // Gleiche Upsert-Semantik wie die Extension: erneutes Markieren
    // aktualisiert den vorhandenen Eintrag statt einen zweiten anzulegen.
    const { error } = await supabase
      .from('platform_listings')
      .upsert(
        {
          item_id: id,
          platform,
          status: 'listed',
          listed_at: now,
          detected_account: 'Handy (manuell)',
        },
        { onConflict: 'item_id,platform' }
      )
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    // Artikelstatus nachziehen — aber nie einen Verkauf zurückstufen.
    const { data: item } = await supabase.from('items').select('status').eq('id', id).single()
    if (item && !['listed', 'sold'].includes(item.status)) {
      await supabase.from('items').update({ status: 'listed', listed_at: now }).eq('id', id)
    }

    // Matrix und Startseite laufen auf ISR — sonst taucht das frisch
    // eingetragene Listing dort erst nach bis zu 30s auf.
    revalidatePath('/')
    revalidatePath('/matrix')
    revalidatePath('/inventory')
    revalidatePath(`/items/${id}`)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String((e && e.message) || e) }, { status: 500 })
  }
}
