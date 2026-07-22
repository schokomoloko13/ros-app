import { NextResponse } from 'next/server'

// GET /api/jarvis/telegram-test
// Schickt eine Test-Nachricht an den konfigurierten Telegram-Chat.
// Einmalig nach dem Deploy aufrufen — bestätigt dass Bot + Chat-ID stimmen.
export const dynamic = 'force-dynamic'

async function sendTelegram(token: string, chatId: string, text: string) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text }),
  })
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text().catch(() => '')}`)
}

export async function GET() {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!token || !chatId) {
    return NextResponse.json(
      { ok: false, error: 'TELEGRAM_BOT_TOKEN oder TELEGRAM_CHAT_ID fehlen in den Env-Vars.' },
      { status: 500 }
    )
  }

  try {
    await sendTelegram(token, chatId, 'R·O·S· Jarvis — Verbindungstest erfolgreich. Bot ist aktiv und bereit.')
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 })
  }
}
