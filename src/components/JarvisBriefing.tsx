'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

// JARVIS Panel v6 — echtes Sprach-Gespräch.
// Der Browser hält eine WebRTC-Audioleitung direkt zu OpenAI: Sprache rein,
// Sprache raus, unterbrechbar. Satzende erkennt der Server, das Tages-Briefing
// spricht Jarvis von sich aus beim Verbinden.
// Bedienung: Kreis = Gespräch an/aus. Mikro = stumm schalten. Sonst nichts.
type Zustand = 'aus' | 'verbinde' | 'live' | 'fehler'

export default function JarvisBriefing() {
  const [zustand, setZustand] = useState<Zustand>('aus')
  const [spricht, setSpricht] = useState(false)
  const [stumm, setStumm] = useState(false)
  const [fehler, setFehler] = useState('')

  const pfad = usePathname()
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const kannSprechen = typeof window !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof RTCPeerConnection !== 'undefined'

  const aufraeumen = useCallback(() => {
    try { pcRef.current?.close() } catch { /* egal */ }
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (audioRef.current) {
      audioRef.current.srcObject = null
      audioRef.current = null
    }
    pcRef.current = null
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
      // Ohne Anstoß wartet das Modell stumm, bis Roberto etwas sagt — hier soll es
      // aber von sich aus mit dem Tages-Briefing eröffnen.
      kanal.onopen = () => {
        try { kanal.send(JSON.stringify({ type: 'response.create' })) } catch { /* egal */ }
      }
      kanal.onmessage = e => {
        try {
          const typ = JSON.parse(e.data)?.type
          if (typ === 'output_audio_buffer.started') setSpricht(true)
          if (typ === 'output_audio_buffer.stopped' || typ === 'output_audio_buffer.cleared') setSpricht(false)
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

  const aktiv = zustand === 'live'

  return (
    <div className="jarvis-float">
      {zustand === 'fehler' && fehler && (
        <span className="jarvis-float-fehler">{fehler}</span>
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
