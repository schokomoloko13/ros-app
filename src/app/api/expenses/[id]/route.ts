import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { CATEGORY_KEYS } from '@/lib/expenses'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ALLOWED = new Set(['amount', 'category', 'expense_date', 'note', 'item_id'])

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({} as any))

    const payload: Record<string, any> = {}
    for (const [k, v] of Object.entries(body || {})) {
      if (!ALLOWED.has(k)) continue
      if (k === 'amount') {
        const n = Number(v)
        if (!Number.isFinite(n)) return bad('amount ist keine Zahl')
        payload.amount = n
      } else if (k === 'category') {
        if (!CATEGORY_KEYS.includes(v as string)) return bad(`unbekannte Kategorie: ${v}`)
        payload.category = v
      } else if (k === 'expense_date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return bad('expense_date muss YYYY-MM-DD sein')
        payload.expense_date = v
      } else {
        // note und item_id dürfen bewusst auf null gesetzt werden
        // (Notiz leeren bzw. Ausgabe vom Artikel lösen).
        payload[k] = v === '' ? null : v
      }
    }

    if (!Object.keys(payload).length) return bad('keine gültigen Felder')

    const { data, error } = await supabase
      .from('expenses').update(payload).eq('id', id).select('*').single()
    if (error) return bad(error.message, 500)

    revalidatePath('/finanzen')
    if (data?.item_id) revalidatePath(`/items/${data.item_id}`)
    return NextResponse.json({ ok: true, expense: data })
  } catch (e: any) {
    return bad(String((e && e.message) || e), 500)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // item_id vorher lesen, damit die Artikelseite danach revalidiert werden kann.
    const { data: before } = await supabase
      .from('expenses').select('item_id').eq('id', id).maybeSingle()

    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) return bad(error.message, 500)

    revalidatePath('/finanzen')
    if (before?.item_id) revalidatePath(`/items/${before.item_id}`)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return bad(String((e && e.message) || e), 500)
  }
}
