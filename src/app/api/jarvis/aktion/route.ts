import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

// Privilegierter Endpunkt für alle Jarvis-Schreibaktionen.
// Nur benannte Werkzeuge landen hier — kein freier SQL-Zugang.
export const dynamic = 'force-dynamic'

const STATUS_DE: Record<string, string> = {
  purchased:    'Eingekauft',
  checked:      'Geprüft',
  photographed: 'Fotografiert',
  listed:       'Gelistet',
  sold:         'Verkauft',
}
const VALID_STATUS    = Object.keys(STATUS_DE)
const VALID_KATEGORIE = ['transport', 'versand', 'verpackung', 'gebuehren', 'pauschale', 'sonstiges']

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function euro(n: number) {
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €'
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function logAktion(
  sb: ReturnType<typeof getDb>,
  params: {
    werkzeug: string
    argumente: Record<string, unknown>
    ziel_tabelle?: string | null
    ziel_id?: string | null
    vorher?: unknown
    zusammenfassung: string
  }
) {
  await sb.from('jarvis_aktionen').insert({
    werkzeug:        params.werkzeug,
    argumente:       params.argumente,
    ziel_tabelle:    params.ziel_tabelle ?? null,
    ziel_id:         params.ziel_id ?? null,
    vorher:          params.vorher ?? null,
    zusammenfassung: params.zusammenfassung,
  })
}

export async function POST(req: NextRequest) {
  const sb = getDb()
  let body: { werkzeug?: string; argumente?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Ungültiger Body' }, { status: 400 })
  }

  const { werkzeug, argumente = {} } = body
  if (!werkzeug) return NextResponse.json({ ok: false, error: 'werkzeug fehlt' }, { status: 400 })

  // ── artikel_suchen ──────────────────────────────────────────────────────────
  if (werkzeug === 'artikel_suchen') {
    const q = String(argumente.suchbegriff ?? '').trim()
    if (!q) return NextResponse.json({ ok: false, error: 'Suchbegriff fehlt' })

    const pattern = `%${q}%`
    const { data, error } = await sb
      .from('items')
      .select('id, name, brand, status, target_price, min_price')
      .or(`name.ilike.${pattern},brand.ilike.${pattern},reference_number.ilike.${pattern}`)
      .neq('status', 'sold')
      .order('created_at', { ascending: false })
      .limit(8)

    if (error) return NextResponse.json({ ok: false, error: error.message })
    if (!data?.length) return NextResponse.json({ ok: true, treffer: [], meldung: 'Kein Artikel gefunden.' })

    const treffer = data.map(i => ({
      id:           i.id,
      name:         i.name,
      marke:        i.brand ?? null,
      status:       STATUS_DE[i.status] ?? i.status,
      zielpreis:    i.target_price != null ? euro(Number(i.target_price)) : null,
      mindestpreis: i.min_price    != null ? euro(Number(i.min_price))    : null,
    }))
    return NextResponse.json({ ok: true, treffer })
  }

  // ── preis_setzen ────────────────────────────────────────────────────────────
  if (werkzeug === 'preis_setzen') {
    const { item_id, target_price, min_price } = argumente
    if (!item_id || target_price == null)
      return NextResponse.json({ ok: false, error: 'item_id und target_price sind Pflicht' })

    const id = String(item_id)
    const { data: vorher } = await sb
      .from('items').select('name, target_price, min_price').eq('id', id).single()
    if (!vorher) return NextResponse.json({ ok: false, error: 'Artikel nicht gefunden.' })

    const payload: Record<string, unknown> = { target_price: Number(target_price) }
    if (min_price != null) payload.min_price = Number(min_price)

    const { error } = await sb.from('items').update(payload).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message })

    revalidatePath('/')
    revalidatePath('/inventory')
    revalidatePath(`/items/${id}`)

    const zusammenfassung =
      `Preis von "${vorher.name}" auf ${euro(Number(target_price))} gesetzt` +
      (min_price != null ? `, Mindestpreis ${euro(Number(min_price))}` : '')

    await logAktion(sb, {
      werkzeug, argumente, ziel_tabelle: 'items', ziel_id: id,
      vorher: { target_price: vorher.target_price, min_price: vorher.min_price },
      zusammenfassung,
    })

    return NextResponse.json({ ok: true, meldung: zusammenfassung + '.' })
  }

  // ── status_setzen ───────────────────────────────────────────────────────────
  if (werkzeug === 'status_setzen') {
    const { item_id, status, sold_price, sold_at } = argumente
    if (!item_id || !status)
      return NextResponse.json({ ok: false, error: 'item_id und status sind Pflicht' })
    if (!VALID_STATUS.includes(String(status)))
      return NextResponse.json({ ok: false, error: `Unbekannter Status: ${status}` })

    const id  = String(item_id)
    const neu = String(status)

    const { data: vorher } = await sb
      .from('items').select('name, status, sold_price, sold_at, listed_at').eq('id', id).single()
    if (!vorher) return NextResponse.json({ ok: false, error: 'Artikel nicht gefunden.' })

    const update: Record<string, unknown> = { status: neu }
    if (neu === 'listed') {
      update.listed_at = new Date().toISOString()
    } else {
      update.listed_at = null
    }
    if (neu === 'sold') {
      update.sold_at = sold_at
        ? new Date(`${sold_at}T12:00:00`).toISOString()
        : new Date().toISOString()
      if (sold_price != null && Number.isFinite(Number(sold_price)))
        update.sold_price = Number(sold_price)
    } else {
      update.sold_price = null
      update.sold_at    = null
    }

    const { error } = await sb.from('items').update(update).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message })

    revalidatePath('/')
    revalidatePath('/inventory')
    revalidatePath('/finanzen')
    revalidatePath(`/items/${id}`)

    const zusammenfassung = neu === 'sold'
      ? `"${vorher.name}" als verkauft markiert${sold_price != null ? ` für ${euro(Number(sold_price))}` : ''}`
      : `Status von "${vorher.name}" auf "${STATUS_DE[neu]}" gesetzt`

    await logAktion(sb, {
      werkzeug, argumente, ziel_tabelle: 'items', ziel_id: id,
      vorher: { status: vorher.status, sold_price: vorher.sold_price, sold_at: vorher.sold_at, listed_at: vorher.listed_at },
      zusammenfassung,
    })

    return NextResponse.json({ ok: true, meldung: zusammenfassung + '.' })
  }

  // ── ausgabe_buchen ──────────────────────────────────────────────────────────
  if (werkzeug === 'ausgabe_buchen') {
    const { betrag, kategorie, notiz, datum, item_id } = argumente
    if (betrag == null)
      return NextResponse.json({ ok: false, error: 'Betrag fehlt' })
    if (!kategorie || !VALID_KATEGORIE.includes(String(kategorie)))
      return NextResponse.json({ ok: false, error: `Unbekannte Kategorie: ${kategorie}` })

    const row: Record<string, unknown> = {
      amount:       Number(betrag),
      category:     String(kategorie),
      expense_date: datum ? String(datum) : todayISO(),
      note:         notiz ? String(notiz).trim() : null,
      item_id:      item_id ? String(item_id) : null,
    }
    const { data, error } = await sb.from('expenses').insert(row).select('id').single()
    if (error) return NextResponse.json({ ok: false, error: error.message })

    revalidatePath('/finanzen')
    if (item_id) revalidatePath(`/items/${item_id}`)

    const zusammenfassung =
      `${euro(Number(betrag))} als ${kategorie} gebucht` +
      (notiz ? ` (${notiz})` : '')

    await logAktion(sb, {
      werkzeug, argumente, ziel_tabelle: 'expenses', ziel_id: data?.id,
      vorher: null, zusammenfassung,
    })

    return NextResponse.json({ ok: true, meldung: zusammenfassung + '.' })
  }

  // ── artikel_anlegen ─────────────────────────────────────────────────────────
  if (werkzeug === 'artikel_anlegen') {
    const { name, einkaufspreis, marke, zielpreis, kategorie, quelle } = argumente
    if (!name || einkaufspreis == null)
      return NextResponse.json({ ok: false, error: 'name und einkaufspreis sind Pflicht' })

    // Kategorie auflösen
    let categoryId: string | null = null
    if (kategorie) {
      const { data: cats } = await sb
        .from('categories').select('id, name').ilike('name', `%${kategorie}%`)
      if (!cats?.length)
        return NextResponse.json({ ok: false, error: `Keine Kategorie für "${kategorie}" gefunden. Roberto kurz fragen.` })
      if (cats.length > 1)
        return NextResponse.json({ ok: false, error: `Mehrere Kategorien: ${cats.slice(0, 3).map(c => c.name).join(', ')}. Welche meint Roberto?` })
      categoryId = cats[0].id
    } else {
      const { data: cats } = await sb.from('categories').select('id').order('sort_order').limit(1)
      categoryId = cats?.[0]?.id ?? null
    }
    if (!categoryId)
      return NextResponse.json({ ok: false, error: 'Keine Kategorien in der Datenbank. Roberto nach der Kategorie fragen.' })

    // Quelle auflösen
    let sourceId: string | null = null
    if (quelle) {
      const { data: srcs } = await sb
        .from('sources').select('id, name').ilike('name', `%${quelle}%`)
      if (!srcs?.length)
        return NextResponse.json({ ok: false, error: `Keine Quelle für "${quelle}" gefunden. Roberto kurz fragen.` })
      if (srcs.length > 1)
        return NextResponse.json({ ok: false, error: `Mehrere Quellen: ${srcs.slice(0, 3).map(s => s.name).join(', ')}. Welche meint Roberto?` })
      sourceId = srcs[0].id
    } else {
      const { data: srcs } = await sb.from('sources').select('id').order('name').limit(1)
      sourceId = srcs?.[0]?.id ?? null
    }
    if (!sourceId)
      return NextResponse.json({ ok: false, error: 'Keine Quellen in der Datenbank. Roberto nach der Quelle fragen.' })

    const { data, error } = await sb
      .from('items')
      .insert({
        name:           String(name),
        brand:          marke ? String(marke) : null,
        purchase_price: Number(einkaufspreis),
        target_price:   zielpreis != null ? Number(zielpreis) : null,
        category_id:    categoryId,
        source_id:      sourceId,
        status:         'purchased',
      })
      .select('id, name')
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message })

    revalidatePath('/')
    revalidatePath('/inventory')

    const zusammenfassung =
      `Neuer Artikel angelegt: "${name}" für ${euro(Number(einkaufspreis))}` +
      (zielpreis != null ? `, Zielpreis ${euro(Number(zielpreis))}` : '')

    await logAktion(sb, {
      werkzeug, argumente, ziel_tabelle: 'items', ziel_id: data?.id,
      vorher: null, zusammenfassung,
    })

    return NextResponse.json({ ok: true, item_id: data?.id, meldung: zusammenfassung + '.' })
  }

  // ── rueckgaengig ────────────────────────────────────────────────────────────
  if (werkzeug === 'rueckgaengig') {
    const { data: letzte, error: fetchErr } = await sb
      .from('jarvis_aktionen')
      .select('*')
      .is('rueckgaengig_am', null)
      .not('werkzeug', 'in', '("artikel_suchen","rueckgaengig")')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (fetchErr || !letzte)
      return NextResponse.json({ ok: false, error: 'Keine Aktion zum Rückgängigmachen vorhanden.' })

    let meldung = ''

    if (letzte.werkzeug === 'artikel_anlegen' && letzte.ziel_id) {
      await getDb().from('items').delete().eq('id', letzte.ziel_id)
      revalidatePath('/')
      revalidatePath('/inventory')
      meldung = `Artikel "${(letzte.argumente as Record<string, unknown>).name}" wieder gelöscht.`

    } else if (letzte.werkzeug === 'ausgabe_buchen' && letzte.ziel_id) {
      await getDb().from('expenses').delete().eq('id', letzte.ziel_id)
      revalidatePath('/finanzen')
      meldung = `Ausgabe über ${euro(Number((letzte.argumente as Record<string, unknown>).betrag))} wieder gelöscht.`

    } else if (letzte.ziel_tabelle === 'items' && letzte.ziel_id && letzte.vorher) {
      const { error } = await sb
        .from('items')
        .update(letzte.vorher as Record<string, unknown>)
        .eq('id', letzte.ziel_id)
      if (error)
        return NextResponse.json({ ok: false, error: `Rückgängig fehlgeschlagen: ${error.message}` })
      revalidatePath('/')
      revalidatePath('/inventory')
      revalidatePath('/finanzen')
      revalidatePath(`/items/${letzte.ziel_id}`)
      meldung = `"${letzte.zusammenfassung}" rückgängig gemacht.`

    } else {
      meldung = 'Diese Aktion kann nicht rückgängig gemacht werden.'
    }

    await sb
      .from('jarvis_aktionen')
      .update({ rueckgaengig_am: new Date().toISOString() })
      .eq('id', letzte.id)

    return NextResponse.json({ ok: true, meldung })
  }

  return NextResponse.json({ ok: false, error: `Unbekanntes Werkzeug: ${werkzeug}` }, { status: 400 })
}
