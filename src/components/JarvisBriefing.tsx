'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

// JARVIS Panel v7 — Sprach-Gespräch + Hände (Function Calling).
// Der Browser hält eine WebRTC-Audioleitung direkt zu OpenAI: Sprache rein,
// Sprache raus, unterbrechbar. Werkzeuge werden über den DataChannel als
// function_call ausgelöst, per /api/jarvis/aktion auf dem Server ausgeführt
// und das Ergebnis über function_call_output zurückgemeldet.
// Bedienung: Kreis = Gespräch an/aus. Mikro = stumm schalten. Sonst nichts.
type Zustand = 'aus' | 'verbinde' | 'live' | 'fehler'

export default function JarvisBriefing() {
  const [zustand, setZustand] = useState<Zustand>('aus')
  const [spricht, setSpricht] = useState(false)
  const [stumm, setStumm] = useState(false)
  const [fehler, setFehler] = useState('')
  // Kurze Bestätigung nach jeder Schreibaktion — verschwindet nach 5 s.
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const router = useRouter()
  const pfad   = usePathname() || '/'
  const pcRef    = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef  = useRef<HTMLAudioElement | null>(null)
  // DataChannel-Ref, damit handleWerkzeug immer auf den aktuellen Kanal zugreifen kann.
  const kanalRef  = useRef<RTCDataChannel | null>(null)

  const kannSprechen = typeof window !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof RTCPeerConnection !== 'undefined'

  const zeigeToast = useCallback((text: string) => {
    setToast(text)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 5000)
  }, [])

  // Werkzeug-Aufruf: Jarvis → DataChannel → Server → Supabase → Ergebnis zurück.
  const handleWerkzeug = useCallback(async (
    callId: string,
    name: string,
    argsStr: string,
  ) => {
    let argumente: Record<string, unknown> = {}
    try { argumente = JSON.parse(argsStr || '{}') } catch { /* egal */ }

    let ergebnis = ''
    try {
      const res  = await fetch('/api/jarvis/aktion', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ werkzeug: name, argumente }),
      })
      const json = await res.json()

      if (json.treffer !== undefined) {
        // artikel_suchen → strukturiertes Ergebnis als Text zurückgeben
        if (!json.treffer.length) {
          ergebnis = 'Kein Artikel gefunden.'
        } else {
          ergebnis = json.treffer
            .map((t: { id: string; name: string; marke?: string; status: string; zielpreis?: string }) =>
              `${t.name}${t.marke ? ` (${t.marke})` : ''} — ${t.status}${t.zielpreis ? ` · ${t.zielpreis}` : ''} — ID: ${t.id}`
            )
            .join('\n')
        }
      } else if (json.ok && json.meldung) {
        ergebnis = json.meldung
        // Schreibaktionen: UI aktualisieren und Toast zeigen
        if (name !== 'artikel_suchen') {
          router.refresh()
          zeigeToast(json.meldung)
        }
      } else {
        ergebnis = json.error || 'Unbekannter Fehler.'
      }
    } catch (err: unknown) {
      ergebnis = `Fehler: ${err instanceof Error ? err.message : 'Verbindungsproblem'}`
    }

    // Ergebnis an Jarvis zurückmelden und nächste Antwort auslösen
    const kanal = kanalRef.current
    if (kanal?.readyState === 'open') {
      kanal.send(JSON.stringify({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: callId, output: ergebnis },
      }))
      kanal.send(JSON.stringify({ type: 'response.create' }))
    }
  }, [router, zeigeToast])

  const aufraeumen = useCallback(() => {
    try { pcRef.current?.close() } catch { /* egal */ }
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (audioRef.current) {
      audioRef.current.srcObject = null
      audioRef.current = null
    }
    pcRef.current  = null
    kanalRef.current = null
    streamRef.current = null
    setSpricht(false)
    setStumm(false)
  }, [])

  const beenden = useCallback(() => {
    aufraeumen()
    setZustand('aus')
  }, [aufraeumen])

  const starten = useCallback(async () => {
    setFehler('')
    setZustand('verbinde')
    try {
      const ticketRes = await fetch('/api/jarvis/realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pfad }),
      })
      const ticket = await ticketRes.json()
      if (!ticketRes.ok) throw new Error(ticket.error || 'Verbindung abgelehnt')

      const pc = new RTCPeerConnection()
      pcRef.current = pc

      // Jarvis' Stimme kommt als eigener Audio-Track zurück.
      const lautsprecher = new Audio()
      lautsprecher.autoplay = true
      audioRef.current = lautsprecher
      pc.ontrack = e => { lautsprecher.srcObject = e.streams[0] }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      const kanal = pc.createDataChannel('oai-events')
      kanalRef.current = kanal
      // Ohne Anstoß wartet das Modell stumm, bis Roberto etwas sagt — hier soll es
      // aber von sich aus mit dem Tages-Briefing eröffnen.
      kanal.onopen = () => {
        try { kanal.send(JSON.stringify({ type: 'response.create' })) } catch { /* egal */ }
      }
      kanal.onmessage = e => {
        try {
          const msg = JSON.parse(e.data)
          const typ: string = msg?.type ?? ''
          if (typ === 'output_audio_buffer.started') setSpricht(true)
          if (typ === 'output_audio_buffer.stopped' || typ === 'output_audio_buffer.cleared') setSpricht(false)
          // Jarvis hat ein Werkzeug aufgerufen — hier ausführen und Ergebnis zurückschicken.
          if (typ === 'response.function_call_arguments.done') {
            handleWerkzeug(msg.call_id, msg.name, msg.arguments ?? '{}')
          }
        } catch { /* egal */ }
      }

      const angebot = await pc.createOffer()
      await pc.setLocalDescription(angebot)

      const antwort = await fetch(
        `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(ticket.model)}`,
        {
          method: 'POST',
          body: angebot.sdp,
          headers: { Authorization: `Bearer ${ticket.token}`, 'Content-Type': 'application/sdp' },
        }
      )
      if (!antwort.ok) throw new Error('Audio-Leitung abgelehnt')
      await pc.setRemoteDescription({ type: 'answer', sdp: await antwort.text() })

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          aufraeumen()
          setZustand('aus')
        }
      }

      setZustand('live')
    } catch (e: any) {
      aufraeumen()
      setZustand('fehler')
      setFehler(
        e?.name === 'NotAllowedError'
          ? 'Mikrofon blockiert — im Browser auf das Schloss-Symbol tippen und Mikrofon erlauben.'
          : (e?.message ?? 'Verbindung fehlgeschlagen')
      )
    }
  }, [aufraeumen, pfad])

  const amKreis = () => {
    if (zustand === 'live' || zustand === 'verbinde') beenden()
    else starten()
  }

  const amMikro = () => {
    const spur = streamRef.current?.getAudioTracks()[0]
    if (!spur) return
    spur.enabled = !spur.enabled
    setStumm(!spur.enabled)
  }

  useEffect(() => aufraeumen, [aufraeumen])

  // /schaufenster ist die Kundenansicht — dort hat Jarvis nichts verloren.
  // Ein laufendes Gespräch wird beendet, sonst bliebe das Mikrofon offen,
  // während ein Kunde auf die Seite schaut.
  const imSchaufenster = pfad.startsWith('/schaufenster')
  useEffect(() => {
    if (imSchaufenster) beenden()
  }, [imSchaufenster, beenden])

  if (imSchaufenster) return null

  const aktiv = zustand === 'live'

  return (
    <div className="jarvis-float">
      {zustand === 'fehler' && fehler && (
        <span className="jarvis-float-fehler">{fehler}</span>
      )}
      {toast && !fehler && (
        <span className="jarvis-float-toast">{toast}</span>
      )}

      {kannSprechen && aktiv && (
        <button
          className={`jarvis-mic${stumm ? '' : ' listening'}`}
          onClick={amMikro}
          aria-label={stumm ? 'Mikrofon einschalten' : 'Mikrofon stumm schalten'}
          title={stumm ? 'Mikrofon ist aus' : 'Mikrofon ist an'}
        >
          {stumm ? '🔇' : '🎙'}
        </button>
      )}

      <button
        className={`jarvis-orb${spricht ? ' speaking' : ''}${zustand === 'verbinde' ? ' loading' : ''}`}
        onClick={amKreis}
        aria-label={aktiv ? 'Gespräch beenden' : 'Mit Jarvis sprechen'}
        title={aktiv ? 'Gespräch beenden' : 'Mit Jarvis sprechen'}
      >
        <span className="jarvis-label">ROS</span>
      </button>
    </div>
  )
}
