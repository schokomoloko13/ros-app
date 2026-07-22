'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// JARVIS Panel v3 —
// Stimme: Gemini TTS via /api/jarvis/speak (Butler-Stimme), Fallback Browser-Stimme.
// Auto: 2× täglich (morgens Begrüßung, ab 22 Uhr Tagesrückblick) — Browser-Autoplay
// wird umschifft, indem Jarvis nötigenfalls auf die erste Berührung wartet.
// Mikro: kontinuierliches Zuhören, Selbst-Neustart, verständliche Fehlerhinweise.
type Phase = 'idle' | 'loading' | 'ready' | 'speaking' | 'listening' | 'thinking' | 'error'
type Msg = { role: 'user' | 'jarvis'; text: string; link?: string | null }

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

function hintFor(reason: string): string {
  switch (reason) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Mikrofon blockiert — im Browser auf das Schloss-Symbol tippen → Mikrofon erlauben. Mac: Systemeinstellungen → Datenschutz → Mikrofon → Browser anhaken.'
    case 'audio-capture':
      return 'Kein Mikrofon gefunden.'
    case 'network':
      return 'Spracherkennung braucht den Chrome-Onlinedienst — Internet oder VPN prüfen.'
    case 'no-speech':
      return 'Nichts gehört — direkt nach dem Klick sprechen.'
    default:
      return `Mikro-Fehler: ${reason}`
  }
}

export default function JarvisBriefing() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState('')
  const [armed, setArmed] = useState(true)
  const [interim, setInterim] = useState('')
  const [input, setInput] = useState('')
  const [thread, setThread] = useState<Msg[]>([])
  const [micHint, setMicHint] = useState('')
  const [pendingVoice, setPendingVoice] = useState(false)

  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const recRef = useRef<any>(null)
  const threadRef = useRef<Msg[]>([])
  const textRef = useRef('')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const SR = typeof window !== 'undefined'
    ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    : null
  const canListen = !!SR

  const loadVoices = useCallback(() => {
    if (!supported) return
    const v = pickGermanVoice(window.speechSynthesis.getVoices())
    if (v) voiceRef.current = v
  }, [supported])

  const stopAllAudio = useCallback(() => {
    if (supported) window.speechSynthesis.cancel()
    try { audioRef.current?.pause() } catch { /* egal */ }
  }, [supported])

  // ── Stimmen ────────────────────────────────────────────────────────────
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
        body: JSON.stringify({ text: say }),
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

  const speakSmart = useCallback(async (say: string): Promise<'played' | 'blocked' | 'failed'> => {
    if (!say) return 'failed'
    stopAllAudio()
    const r = await speakCloud(say)
    if (r === 'failed') speakBrowser(say)
    return r
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
        // Browser erlaubt Ton noch nicht → auf erste Berührung warten
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
      try { recRef.current?.stop?.() } catch { /* egal */ }
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
    setInterim('')
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

  const listen = useCallback(() => {
    if (!canListen) return
    if (phase === 'listening') {
      try { recRef.current?.stop?.() } catch { /* egal */ }
      setPhase('ready')
      return
    }
    stopAllAudio()
    setMicHint('')
    const rec = new SR()
    recRef.current = rec
    rec.lang = 'de-DE'
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.continuous = true

    let gotFinal = false
    let retried = false
    let fatal = false

    setInterim('')
    setPhase('listening')

    rec.onresult = (ev: any) => {
      let final = ''
      let inter = ''
      for (let k = 0; k < ev.results.length; k++) {
        const r = ev.results[k]
        if (r.isFinal) final += r[0].transcript
        else inter += r[0].transcript
      }
      setInterim(final || inter)
      if (final) {
        gotFinal = true
        try { rec.stop() } catch { /* egal */ }
        ask(final)
      }
    }
    rec.onerror = (ev: any) => {
      const reason = ev?.error || 'unbekannt'
      setMicHint(hintFor(reason))
      if (reason === 'not-allowed' || reason === 'service-not-allowed' || reason === 'audio-capture') fatal = true
    }
    rec.onend = () => {
      if (gotFinal) return
      if (!fatal && !retried) {
        retried = true
        try { rec.start(); return } catch { /* durchfallen */ }
      }
      setPhase(p => (p === 'listening' ? 'ready' : p))
    }
    try {
      rec.start()
    } catch {
      setPhase('ready')
    }
  }, [canListen, phase, ask, stopAllAudio, SR])

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
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
            <button
              onClick={toggleArm}
              style={{
                marginLeft: 'auto', padding: '0.15rem 0.55rem', borderRadius: '999px',
                border: armed ? '1px solid #06b6d4' : '1px solid #1e293b',
                background: armed ? 'rgba(6,182,212,0.12)' : 'transparent',
                color: armed ? '#06b6d4' : '#475569',
                fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em',
                cursor: 'pointer', fontFamily: 'inherit',
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
            title={phase === 'listening' ? 'Ich höre … (tippen zum Stoppen)' : 'Mikro antippen und sprechen'}
          >
            🎙
          </button>
        )}
        <input
          className="form-input"
          style={{ flex: '1 1 auto', width: 'auto' }}
          placeholder={
            phase === 'listening'
              ? (interim || 'Ich höre …')
              : (canListen ? 'Oder hier tippen: „Wie lange ist die Datejust online?"' : 'Frage an Jarvis tippen …')
          }
          value={phase === 'listening' ? interim : input}
          onChange={e => { if (phase !== 'listening') setInput(e.target.value) }}
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
          Spracheingabe läuft am besten in Chrome — Tippen geht überall.
        </div>
      )}
    </div>
  )
}
