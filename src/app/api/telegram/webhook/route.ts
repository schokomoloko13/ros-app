// Telegram-Rückkanal: empfängt Updates, lässt Jarvis per GPT antworten.
// Schreibaktionen (markSold, updateStatus) erst nach "ja" ausführen.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function tgSend(token: string, chatId: string | number, text: string) {
  const chunks: string[] = []
  let rest = text
  while (rest.length > 4096) {
    let cut = rest.lastIndexOf('\n', 4096)
    if (cut <= 0) cut = 4096
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut).trimStart()
  }
  if (rest) chunks.push(rest)
  for (const chunk of chunks) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk }),
    })
  }
}

const TOOLS = [
  { type: 'function', function: { name: 'getInventory', description: 'Aktuelle Artikel aus der DB, gefiltert nach Status.', parameters: { type: 'object', properties: { status: { type: 'string', enum: ['purchased','checked','photographed','listed','sold','all'] } } } } },
  { type: 'function', function: { name: 'getStats', description: 'Verkaufsstatistiken für einen Zeitraum.', parameters: { type: 'object', properties: { days: { type: 'number', description: 'Tage zurückschauen, z.B. 7, 30.' } }, required: ['days'] } } },
  { type: 'function', function: { name: 'getMarketPrice', description: 'Schätzt den aktuellen Marktpreis.', parameters: { type: 'object', properties: { item_id: { type: 'string' }, description: { type: 'string' } } } } },
  { type: 'function', function: { name: 'markSold', description: 'Markiert Artikel als verkauft. SCHREIBAKTION.', parameters: { type: 'object', properties: { item_id: { type: 'string' }, price: { type: 'number' } }, required: ['item_id'] } } },
  { type: 'function', function: { name: 'updateStatus', description: 'Ändert Artikel-Status. SCHREIBAKTION.', parameters: { type: 'object', properties: { item_id: { type: 'string' }, status: { type: 'string', enum: ['purchased','checked','photographed','listed','sold'] } }, required: ['item_id','status'] } } },
]

const WRITE_TOOLS = new Set(['markSold', 'updateStatus'])

async function execRead(name: string, args: any): Promise<string> {
  const supabase = db()
  const fmtE = (n: any) => n != null ? `${Number(n).toLocaleString('de-DE')} €` : '–'

  if (name === 'getInventory') {
    const status = args.status ?? 'all'
    let q = supabase.from('items').select('id,name,brand,status,target_price').order('created_at', { ascending: false }).limit(80)
    if (status !== 'all') q = q.eq('status', status)
    const { data } = await q
    if (!data?.length) return 'Keine Artikel.'
    return data.map(i => `[${i.id.slice(0,8)}] ${i.name ?? '?'} | ${i.brand ?? '–'} | ${i.status} | ${fmtE(i.target_price)}`).join('\n')
  }

  if (name === 'getStats') {
    const days = Number(args.days) || 30
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const { data } = await supabase.from('items').select('sold_price,target_price,purchase_price').eq('status','sold').gte('sold_at', since)
    const count  = data?.length ?? 0
    const rev    = data?.reduce((s,i) => s + Number(i.sold_price ?? i.target_price ?? 0), 0) ?? 0
    const cogs   = data?.reduce((s,i) => s + Number(i.purchase_price ?? 0), 0) ?? 0
    return `${days} Tage: ${count} Verkäufe · Umsatz ${fmtE(rev)} · Einkauf ${fmtE(cogs)} · Gewinn ${fmtE(rev - cogs)}`
  }

  if (name === 'getMarketPrice') {
    if (args.item_id) {
      const { data: it } = await supabase.from('items').select('name,brand,target_price,min_price,reference_number,year,condition_score').eq('id', args.item_id).single()
      if (!it) return 'Artikel nicht gefunden.'
      return `${it.name} | ${it.brand} | Ref ${it.reference_number ?? '–'} | ${it.year ?? '–'} | Zustand ${it.condition_score ?? '–'}/10 | VK ${fmtE(it.target_price)} | Min ${fmtE(it.min_price)}`
    }
    return `Beschreibung: ${args.description ?? '?'}`
  }

  return 'Unbekanntes Tool.'
}

async function execWrite(name: string, args: any): Promise<string> {
  const supabase = db()
  const now = new Date().toISOString()

  if (name === 'markSold') {
    const update: any = { status: 'sold', sold_at: now, updated_at: now }
    if (args.price != null) update.sold_price = args.price
    const { error } = await supabase.from('items').update(update).eq('id', args.item_id)
    if (error) return `Fehler: ${error.message}`
    revalidatePath('/'); revalidatePath('/inventory')
    return `Erledigt — als verkauft markiert${args.price ? ` für ${Number(args.price).toLocaleString('de-DE')} €` : ''}.`
  }

  if (name === 'updateStatus') {
    const update: any = { status: args.status, updated_at: now }
    if (args.status === 'listed') update.listed_at = now
    else update.listed_at = null
    if (args.status !== 'sold') { update.sold_price = null; update.sold_at = null }
    const { error } = await supabase.from('items').update(update).eq('id', args.item_id)
    if (error) return `Fehler: ${error.message}`
    revalidatePath('/'); revalidatePath('/inventory')
    return `Status auf "${args.status}" gesetzt.`
  }
  return 'Unbekannte Aktion.'
}

export async function POST(req: NextRequest) {
  const token   = process.env.TELEGRAM_BOT_TOKEN
  const secret  = process.env.TELEGRAM_WEBHOOK_SECRET
  const allowed = process.env.TELEGRAM_CHAT_ID
  const oKey    = process.env.OPENAI_API_KEY
  if (!token || !oKey) return NextResponse.json({ ok: true })

  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new Response('Forbidden', { status: 403 })
  }

  let update: any
  try { update = await req.json() } catch { return NextResponse.json({ ok: true }) }

  const msg    = update?.message
  const chatId = msg?.chat?.id
  const text   = msg?.text?.trim() ?? ''
  if (!chatId || !text) return NextResponse.json({ ok: true })
  if (allowed && String(chatId) !== String(allowed)) return NextResponse.json({ ok: true })

  const supabase = db()

  // ── Bestätigung prüfen ────────────────────────────────────────────────────
  if (/^(ja|yes|ok|bestätigt?|confirm)$/i.test(text)) {
    const { data: pending } = await supabase
      .from('telegram_pending_actions')
      .select('*')
      .eq('chat_id', String(chatId))
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pending) {
      await supabase.from('telegram_pending_actions').delete().eq('id', pending.id)
      const result = await execWrite(pending.action_name, pending.action_args)
      await tgSend(token, chatId, result)
      return NextResponse.json({ ok: true })
    }
  }

  // Abgelaufene aufräumen
  await supabase.from('telegram_pending_actions').delete()
    .eq('chat_id', String(chatId)).lt('expires_at', new Date().toISOString())

  // ── Kontext laden ─────────────────────────────────────────────────────────
  const { data: items } = await supabase
    .from('items').select('id,name,brand,status,target_price,sold_at,created_at')
    .order('created_at', { ascending: false }).limit(200)

  const all = items || []
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const sold30 = all.filter(i => i.status === 'sold' && i.sold_at && i.sold_at >= monthStart)
  const monRev = sold30.reduce((s, i) => s + Number(i.target_price ?? 0), 0)
  const fmtE = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €'
  const kontext = `Aktiv: ${all.filter(i => i.status !== 'sold').length} Artikel (${all.filter(i => i.status === 'listed').length} online). Monat: ${sold30.length} Verkäufe, ${fmtE(monRev)}.`

  // ── GPT mit Function Calling ──────────────────────────────────────────────
  const msgs: any[] = [
    {
      role: 'system',
      content: 'Du bist J.A.R.V.I.S., Robertos Assistent für seinen Uhren-Handel (R.O.S.). Kurz und direkt auf Hochdeutsch. Keine Emojis. Lesefragen sofort beantworten. Vor JEDER Schreibaktion (markSold, updateStatus) erst kurze Zusammenfassung, dann auf "ja" warten.\n\n' + kontext,
    },
    { role: 'user', content: text },
  ]

  let reply = ''
  for (let round = 0; round < 4; round++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${oKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: msgs, tools: TOOLS, tool_choice: 'auto', max_tokens: 500 }),
    })
    if (!res.ok) { reply = 'GPT nicht erreichbar.'; break }
    const json    = await res.json()
    const gptMsg  = json.choices?.[0]?.message
    if (!gptMsg) break
    msgs.push(gptMsg)

    if (!gptMsg.tool_calls?.length) { reply = gptMsg.content ?? ''; break }

    let hasWrite = false
    for (const call of gptMsg.tool_calls) {
      const fn   = call.function.name
      const args = JSON.parse(call.function.arguments || '{}')

      if (WRITE_TOOLS.has(fn)) {
        hasWrite = true
        let label = args.item_id ?? '?'
        const found = all.find(i => i.id === args.item_id)
        if (found) label = `${found.name ?? '?'} [${args.item_id.slice(0,8)}]`
        const summary = fn === 'markSold'
          ? `${label} als verkauft markieren${args.price ? ` für ${Number(args.price).toLocaleString('de-DE')} €` : ''}`
          : `Status von ${label} auf "${args.status}" setzen`
        await supabase.from('telegram_pending_actions').delete().eq('chat_id', String(chatId))
        await supabase.from('telegram_pending_actions').insert({ chat_id: String(chatId), action_name: fn, action_args: args, summary })
        reply = `${summary} — mit "ja" bestätigen.`
        break
      } else {
        const result = await execRead(fn, args)
        msgs.push({ role: 'tool', tool_call_id: call.id, content: result })
      }
    }
    if (hasWrite) break
  }

  if (reply) await tgSend(token, chatId, reply)
  return NextResponse.json({ ok: true })
}
