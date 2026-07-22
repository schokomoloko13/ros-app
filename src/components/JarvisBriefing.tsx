'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// JARVIS Panel v4 —
// Sprechen: Gemini TTS (Butler-Stimme, wählbar) mit Sprech-Sperre gegen Überlagerung.
// Hören: MediaRecorder → Gemini-Transkription (kein Chrome-Sprachdienst, läuft auch iOS).
// Auto: 2× täglich (morgens / ab 22 Uhr), Browser-Autoplay wird per Gesten-Falle umschifft.
type Phase = 'idle' | 'loading' | 'ready' | 'speaking' | 'listening' | 'thinking' | 'error'
type Msg = { role: 'user' | 'jarvis'; text: string; link?: string | null }

const VOICES = [
  { id: 'Charon', label: 'Charon · tief' },
  { id: 'Fenrir', label: 'Fenrir · kräftig' },
  { id: 'Orus', label: 'Orus · ruhig' },
  { id: 'Kore', label: 'Kore · weiblich' },
  { id: 'Algieba', label: 'Algieba · weich' },
]

function pickGermanVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const de = voices.filter(v => v.lang.toLowerCase().startsWith('de'))
  return (
    de.find(v => /google/i.test(v.name)) ||
    de.find(v => /anna|petra|siri|markus|yannick|katrin/i.test(v.name)) ||
    de.find(v => v.lang.toLowerCase() === 'de-de') ||
    de[0] ||
    null
  )
}

const slotNow = (): 'abend' | 'morgen' => (new Date().getHours() >= 22 ? 'abend' : 'morgen')
const todayStr = () => new Date().toISOString().slice(0, 10)

const blobToB64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => {
    const s = String(r.result)
    resolve(s.slice(s.indexOf(',') + 1))
  }
  r.onerror = reject
  r.readAsDataURL(blob)
})

export default function JarvisBriefing() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState('')
  const [armed, setArmed] = useState(true)
  const [voice, setVoice] = useState('Charon')
  const [input, setInput] = useState('')
  const [thread, setThread] = useState<Msg[]>([])
  const [micHint, setMicHint] = useState('')
  const [pendingVoice, setPendingVoice] = useState(false)

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const threadRef = useRef<Msg[]>([])
  const textRef = useRef('')
  const voiceSelRef = useRef('Charon')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speakLock = useRef(false)
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const sendRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const canListen = typeof window !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof (window as any).MediaRecorder !== 'undefined'

  const loadVoices = useCallback(() => {
    if (!supported) return
    const v = pickGermanVoice(window.speechSynthesis.getVoices())
    if (v) voiceRef.current = v
  }, [supported])

  const stopAllAudio = useCallback(() => {
    if (supported) window.speechSynthesis.cancel()
    try { audioRef.current?.pause() } catch { /* egal */ }
  }, [supported])

  // ── Stimmen (Ausgabe) ──────────────────────────────────────────────────
  const speakBrowser = useCallback((say: string) => {
    if (!supported || !say) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(say)
    if (voiceRef.current) u.voice = voiceRef.current
    u.lang = 'de-DE'
    u.rate = 1.02
    u.pitch = 0.92
    u.onstart = () => setPhase('speaking')
    u.onend = () => setPhase('ready')
    u.onerror = () => setPhase('ready')
    window.speechSynthesis.speak(u)
  }, [supported])

  const speakCloud = useCallback(async (say: string): Promise<'played' | 'blocked' | 'failed'> => {
    try {
      const res = await fetch('/api/jarvis/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: say, voice: voiceSelRef.current }),
      })
      if (!res.ok) return 'failed'
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { setPhase('ready'); URL.revokeObjectURL(url) }
      audio.onerror = () => { setPhase('ready'); URL.revokeObjectURL(url) }
      await audio.play()
      setPhase('speaking')
      return 'played'
    } catch {
      return 'blocked'
    }
  }, [])

  // Sprech-Sperre: nie zwei Stimmen gleichzeitig (Kanon-Fix).
  const speakSmart = useCallback(async (say: string): Promise<'played' | 'blocked' | 'failed'> => {
    if (!say || speakLock.current) return 'failed'
    speakLock.current = true
    try {
      stopAllAudio()
      const r = await speakCloud(say)
      if (r === 'failed') speakBrowser(say)
      return r
    } finally {
      speakLock.current = false
    }
  }, [speakCloud, speakBrowser, stopAllAudio])

  // ── Briefing ───────────────────────────────────────────────────────────
  const fetchBriefing = useCallback(async (slot: 'abend' | 'morgen'): Promise<string> => {
    setPhase('loading')
    try {
      const res = await fetch(`/api/jarvis${slot === 'abend' ? '?slot=abend' : ''}`, { cache: 'no-store' })
      const data = await res.json()
      const say = String(data.text || '')
      textRef.current = say
      setText(say)
      setPhase('ready')
      return say
    } catch {
      setPhase('error')
      return ''
    }
  }, [])

  const markPlayed = useCallback((slot: string) => {
    try {
      localStorage.setItem('jarvis-last', JSON.stringify({ today: todayStr(), slot }))
    } catch { /* egal */ }
  }, [])

  // ── Auto-Briefing beim Öffnen (max. 1× pro Slot pro Tag) ───────────────
  useEffect(() => {
    loadVoices()
    if (supported) window.speechSynthesis.onvoiceschanged = loadVoices

    const storedVoice = localStorage.getItem('jarvis-voice')
    if (storedVoice && VOICES.some(v => v.id === storedVoice)) {
      setVoice(storedVoice)
      voiceSelRef.current = storedVoice
    }

    const storedArm = localStorage.getItem('jarvis-armed')
    const isArmed = storedArm !== '0' // Standard: AN
    setArmed(isArmed)

    const slot = slotNow()
    let due = false
    if (isArmed) {
      try {
        const last = JSON.parse(localStorage.getItem('jarvis-last') || '{}')
        due = !(last.today === todayStr() && last.slot === slot)
      } catch {
        due = true
      }
    }

    ;(async () => {
      const say = await fetchBriefing(slot)
      if (!due || !say) return
      markPlayed(slot)
      const r = await speakSmart(say)
      if (r === 'blocked') {
        setPendingVoice(true)
        const onGesture = () => {
          setPendingVoice(false)
          speakSmart(textRef.current)
        }
        window.addEventListener('pointerdown', onGesture, { once: true })
        window.addEventListener('keydown', onGesture, { once: true })
      }
    })()

    return () => {
      stopAllAudio()
      try { mrRef.current?.stop() } catch { /* egal */ }
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Gespräch ───────────────────────────────────────────────────────────
  const ask = useCallback(async (msg: string) => {
    const clean = msg.trim()
    if (!clean) return
    stopAllAudio()
    const history = threadRef.current.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      text: m.text,
    }))
    const nextThread: Msg[] = [...threadRef.current, { role: 'user', text: clean }]
    threadRef.current = nextThread
    setThread(nextThread)
    setInput('')
    setPhase('thinking')
    try {
      const res = await fetch('/api/jarvis/talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: clean, history }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fehler')
      const answer: Msg = { role: 'jarvis', text: data.reply, link: data.link ?? null }
      const withAnswer = [...threadRef.current, answer]
      threadRef.current = withAnswer
      setThread(withAnswer)
      setPhase('ready')
      speakSmart(data.reply)
    } catch (e: any) {
      const errText = `Entschuldigung, da ist etwas schiefgelaufen: ${e?.message ?? 'unbekannter Fehler'}`
      const withErr = [...threadRef.current, { role: 'jarvis' as const, text: errText }]
      threadRef.current = withErr
      setThread(withErr)
      setPhase('ready')
    }
  }, [speakSmart, stopAllAudio])

  // ── Hören (MediaRecorder → Gemini) ─────────────────────────────────────
  const stopRecording = useCallback((send: boolean) => {
    sendRef.current = send
    try { mrRef.current?.stop() } catch { /* egal */ }
  }, [])

  const listen = useCallback(async () => {
    if (!canListen) return
    if (phase === 'listening') {
      stopRecording(true)
      return
    }
    stopAllAudio()
    setMicHint('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : ''
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      mrRef.current = mr
      chunksRef.current = []

      mr.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (timerRef.current) clearTimeout(timerRef.current)
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (!sendRef.current) { setPhase('ready'); return }
        if (blob.size < 500) {
          setPhase('ready')
          setMicHint('Aufnahme zu kurz — nach dem Klick sprechen, dann erneut tippen zum Senden.')
          return
        }
        setPhase('thinking')
        try {
          const b64 = await blobToB64(blob)
          const res = await fetch('/api/jarvis/listen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: b64, mime: blob.type || 'audio/webm' }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Fehler')
          const tr = String(data.transcript || '').trim()
          if (!tr) {
            setPhase('ready')
            setMicHint('Nichts verstanden — nochmal versuchen.')
            return
          }
          ask(tr)
        } catch (e: any) {
          setPhase('ready')
          setMicHint(`Verstehen fehlgeschlagen: ${e?.message ?? 'Fehler'}`)
        }
      }

      sendRef.current = true
      mr.start()
      setPhase('listening')
      timerRef.current = setTimeout(() => stopRecording(true), 15000)
    } catch (e: any) {
      setPhase('ready')
      setMicHint(e?.name === 'NotAllowedError'
        ? 'Mikrofon blockiert — im Browser auf das Schloss-Symbol tippen → Mikrofon erlauben. Mac: Systemeinstellungen → Datenschutz → Mikrofon → Browser anhaken.'
        : `Mikro-Fehler: ${e?.message ?? e?.name ?? 'unbekannt'}`)
    }
  }, [canListen, phase, ask, stopAllAudio, stopRecording])

  // ── UI-Aktionen ────────────────────────────────────────────────────────
  const onOrb = () => {
    if (phase === 'speaking') {
      stopAllAudio()
      setPhase('ready')
      return
    }
    setPendingVoice(false)
    if (textRef.current) speakSmart(textRef.current)
    else fetchBriefing(slotNow()).then(say => say && speakSmart(say))
  }

  const toggleArm = () => {
    const next = !armed
    setArmed(next)
    localStorage.setItem('jarvis-armed', next ? '1' : '0')
  }

  const onVoiceChange = (v: string) => {
    setVoice(v)
    voiceSelRef.current = v
    localStorage.setItem('jarvis-voice', v)
  }

  const busy = phase === 'thinking' || phase === 'listening'

  return (
    <div className="panel jarvis-wrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          className={`jarvis-orb${phase === 'speaking' ? ' speaking' : ''}${phase === 'loading' ? ' loading' : ''}`}
          onClick={onOrb}
          aria-label={phase === 'speaking' ? 'Jarvis stoppen' : 'Jarvis Briefing abspielen'}
          title={phase === 'speaking' ? 'Stopp' : 'Briefing anhören'}
        >
          <span className="jarvis-core" />
        </button>

        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', letterSpacing: '0.18em', color: '#06b6d4', fontWeight: 700 }}>
              J.A.R.V.I.S.
            </span>
            {phase === 'speaking' && (
              <span className="jarvis-eq" aria-hidden>
                <span /><span /><span /><span />
              </span>
            )}
            {phase === 'thinking' && (
              <span style={{ fontSize: '0.6rem', color: '#475569' }}>denkt nach …</span>
            )}
            <select
              value={voice}
              onChange={e => onVoiceChange(e.target.value)}
              className="form-input"
              style={{ width: 'auto', padding: '0.12rem 0.4rem', fontSize: '0.56rem', flexShrink: 0, marginLeft: 'auto' }}
              title="Jarvis-Stimme wählen (gilt ab der nächsten Antwort)"
              aria-label="Stimme wählen"
            >
              {VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <button
              onClick={toggleArm}
              style={{
                padding: '0.15rem 0.55rem', borderRadius: '999px',
                border: armed ? '1px solid #06b6d4' : '1px solid #1e293b',
                background: armed ? 'rgba(6,182,212,0.12)' : 'transparent',
                color: armed ? '#06b6d4' : '#475569',
                fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em',
                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              }}
              title="Auto-Briefing: morgens + ab 22 Uhr je 1× pro Tag"
            >
              AUTO {armed ? 'AN' : 'AUS'}
            </button>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.55 }}>
            {phase === 'loading' && 'Briefing wird zusammengestellt …'}
            {phase === 'error' && 'Briefing konnte nicht geladen werden.'}
            {phase !== 'loading' && phase !== 'error' && (text || 'Orb antippen für das Briefing.')}
          </div>
          {pendingVoice && (
            <div className="jarvis-hint" style={{ color: '#f59e0b' }}>
              Jarvis hat ein Update bereit — einmal irgendwo tippen, dann spreche ich.
            </div>
          )}
        </div>
      </div>

      {/* ── Gespräch ─────────────────────────────────────────── */}
      {thread.length > 0 && (
        <div className="jarvis-thread">
          {thread.map((m, k) => (
            <div key={k} style={{ marginBottom: '0.45rem' }}>
              <span style={{
                fontSize: '0.58rem', letterSpacing: '0.12em', fontWeight: 700,
                color: m.role === 'user' ? '#475569' : '#06b6d4',
              }}>
                {m.role === 'user' ? 'DU' : 'JARVIS'}
              </span>
              <div style={{ fontSize: '0.78rem', color: m.role === 'user' ? '#64748b' : '#c9d7e8', lineHeight: 1.5 }}>
                {m.text}
                {m.link && (
                  <a href={m.link} style={{
                    marginLeft: '0.5rem', fontSize: '0.68rem', color: '#06b6d4',
                    textDecoration: 'none', borderBottom: '1px solid rgba(6,182,212,0.4)',
                  }}>
                    Öffnen →
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="jarvis-talk-row">
        {canListen && (
          <button
            className={`jarvis-mic${phase === 'listening' ? ' listening' : ''}`}
            onClick={listen}
            aria-label="Mit Jarvis sprechen"
            title={phase === 'listening' ? 'Aufnahme läuft — tippen zum Senden' : 'Mikro antippen, sprechen, erneut tippen'}
          >
            🎙
          </button>
        )}
        <input
          className="form-input"
          style={{ flex: '1 1 auto', width: 'auto' }}
          placeholder={
            phase === 'listening'
              ? '● Aufnahme läuft — 🎙 erneut tippen zum Senden'
              : (canListen ? 'Oder hier tippen: „Wie lange ist die Datejust online?"' : 'Frage an Jarvis tippen …')
          }
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !busy) ask(input) }}
          readOnly={phase === 'listening'}
          disabled={busy && phase !== 'listening'}
        />
        <button
          className="btn-primary"
          style={{ padding: '0.5rem 0.9rem', fontSize: '0.72rem', flexShrink: 0 }}
          onClick={() => ask(input)}
          disabled={busy || !input.trim()}
        >
          SENDEN
        </button>
      </div>
      {micHint && (
        <div className="jarvis-hint" style={{ color: '#ef4444' }}>{micHint}</div>
      )}
      {!canListen && (
        <div style={{ fontSize: '0.58rem', color: '#334155', marginTop: '0.35rem' }}>
          Spracheingabe braucht Mikrofon-Zugriff — Tippen geht überall.
        </div>
      )}
    </div>
  )
}
