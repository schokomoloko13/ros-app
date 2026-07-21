import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

// Server-seitig mit Service-Key → Schreiben klappt unabhängig von RLS-Policies.
// Nur erlaubte Felder werden übernommen (berechnete Felder sind ausgeschlossen).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ALLOWED = new Set([
  'name', 'brand', 'reference_number', 'year', 'color', 'size',
  'diameter_mm', 'material', 'movement', 'condition_score',
  'purchase_price', 'target_price', 'min_price',
  // Kaufdatum und echter Verkaufspreis — Basis der /finanzen-Auswertung.
  'purchase_date', 'sold_price', 'sold_at',
  'category_id', 'source_id', 'zone_id',
])

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const payload: Record<string, any> = {}
    for (const [k, v] of Object.entries(body || {})) {
      if (ALLOWED.has(k)) payload[k] = v === '' ? null : v
    }
    if (!Object.keys(payload).length) {
      return NextResponse.json({ ok: false, error: 'keine gültigen Felder' }, { status: 400 })
    }

    const { error } = await supabase.from('items').update(payload).eq('id', id)
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    // Die Listen-Seiten laufen auf ISR — ohne das hier zeigt router.refresh()
    // bis zu 30s lang die alten Werte.
    revalidatePath('/')
    revalidatePath('/inventory')
    revalidatePath(`/items/${id}`)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String((e && e.message) || e) }, { status: 500 })
  }
}
