import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { CATEGORY_KEYS } from '@/lib/expenses'

// Server-seitig mit Service-Key → Schreiben klappt unabhängig von RLS-Policies.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type SplitItem = { item_id: string; share_amount?: number | string }

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}

/**
 * POST /api/expenses
 *
 * Einzelne Ausgabe:
 *   { amount, category, expense_date?, note?, item_id? }
 * Split über mehrere Artikel:
 *   { amount, category, expense_date?, note?, mode: 'equal'|'manual',
 *     items: [{ item_id, share_amount }] }
 *
 * Ohne items (bzw. leeres Array) entsteht eine allgemeine Ausgabe mit
 * item_id = null.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any))

    const amount = Number(body.amount)
    if (!Number.isFinite(amount)) return bad('amount fehlt oder ist keine Zahl')

    const category = body.category ?? 'sonstiges'
    if (!CATEGORY_KEYS.includes(category)) return bad(`unbekannte Kategorie: ${category}`)

    const expenseDate: string | undefined = body.expense_date || undefined
    if (expenseDate && !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      return bad('expense_date muss YYYY-MM-DD sein')
    }
    const note = body.note ? String(body.note).trim() || null : null

    const items: SplitItem[] = Array.isArray(body.items)
      ? body.items.filter((i: any) => i && i.item_id)
      : []

    // ── Allgemeine bzw. einzelne Ausgabe ───────────────────────────────────
    if (items.length === 0) {
      const row = {
        item_id: body.item_id || null,
        amount,
        category,
        note,
        ...(expenseDate ? { expense_date: expenseDate } : {}),
      }
      const { data, error } = await supabase.from('expenses').insert(row).select('*')
      if (error) return bad(error.message, 500)
      revalidatePath('/finanzen')
      if (row.item_id) revalidatePath(`/items/${row.item_id}`)
      return NextResponse.json({ ok: true, count: data?.length ?? 0, expenses: data })
    }

    // ── Split ──────────────────────────────────────────────────────────────
    const mode = body.mode === 'manual' ? 'manual' : 'equal'
    // Gemeinsame Klammer über alle Zeilen eines Splits.
    const splitGroup = randomUUID()

    let rows: Record<string, unknown>[]
    if (mode === 'equal') {
      // Auf Cent runden und den Rundungsrest auf die erste Zeile legen, damit
      // die Summe der Zeilen exakt dem Gesamtbetrag entspricht (z. B. 10 / 3).
      const cents = Math.round(amount * 100)
      const base = Math.floor(cents / items.length)
      const rest = cents - base * items.length
      rows = items.map((it, idx) => ({
        item_id: it.item_id,
        amount: (base + (idx === 0 ? rest : 0)) / 100,
        category,
        note,
        split_group: splitGroup,
        ...(expenseDate ? { expense_date: expenseDate } : {}),
      }))
    } else {
      for (const it of items) {
        if (!Number.isFinite(Number(it.share_amount))) {
          return bad('bei mode=manual braucht jeder Artikel ein share_amount')
        }
      }
      rows = items.map(it => ({
        item_id: it.item_id,
        amount: Number(it.share_amount),
        category,
        note,
        split_group: splitGroup,
        ...(expenseDate ? { expense_date: expenseDate } : {}),
      }))
    }

    const { data, error } = await supabase.from('expenses').insert(rows).select('*')
    if (error) return bad(error.message, 500)

    revalidatePath('/finanzen')
    for (const it of items) revalidatePath(`/items/${it.item_id}`)

    return NextResponse.json({
      ok: true,
      count: data?.length ?? 0,
      split_group: splitGroup,
      expenses: data,
    })
  } catch (e: any) {
    return bad(String((e && e.message) || e), 500)
  }
}
