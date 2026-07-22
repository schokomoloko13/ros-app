'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// JARVIS Panel — Tages-Briefing (Orb) + freie Konversation (Mikro/Text).
// Sprachausgabe: Web Speech API. Spracherkennung: Chrome (Web Speech API).
// Gespräche laufen über /api/jarvis/talk (Gemini + Live-Bestandsdaten).
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

export default function JarvisBriefing() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState('')
  const [armed, setArmed] = useState(false)
  const [interim, setInterim] = useState('')
  const [input, setInput] = useState('')
  const [thread, setThread] = useState<Msg[]>([])
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const recRef = useRef<any>(null)
  const threadRef = useRef<Msg[]>([])

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

  useEffect(() => {
    if (!supported) return
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
    setArmed(localStorage.getItem('jarvis-armed') === '1')
  }, [supported, loadVoices])

  const speak = useCallback((say: string) => {
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

  const fetchBriefing = useCallback(async (withVoice: boolean) => {
    setPhase('loading')
    try {
      const res = await fetch('/api/jarvis', { cache: 'no-store' })
      const data = await res.json()
      setText(data.text || '')
      setPhase('ready')
      if (withVoice) speak(data.text || '')
    } catch {
      setPhase('error')
    }
  }, [speak])

  // Beim Öffnen: Text immer holen; Stimme nur, wenn AUTO an ist.
  useEffect(() => {
    fetchBriefing(localStorage.getItem('jarvis-armed') === '1')
    return () => {
      if (supported) window.speechSynthesis.cancel()
      try { recRef.current?.stop?.() } catch { /* egal */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ask = useCallback(async (msg: string) => {
    const clean = msg.trim()
    if (!clean) return
    if (supported) window.speechSynthesis.cancel()
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
      speak(data.reply)
      setPhase('ready')
    } catch (e: any) {
      const errText = `Entschuldigung, da ist etwas schiefgelaufen: ${e?.message ?? 'unbekannter Fehler'}`
      const withErr = [...threadRef.current, { role: 'jarvis' as const, text: errText }]
      threadRef.current = withErr
      setThread(withErr)
      setPhase('ready')
    }
  }, [speak, supported])

  const listen = useCallback(() => {
    if (!canListen) return
    if (supported) window.speechSynthesis.cancel()
    try { recRef.current?.stop?.() } catch { /* egal */ }
    const rec = new SR()
    recRef.current = rec
    rec.lang = 'de-DE'
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.continuous = false
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
        try { rec.stop() } catch { /* egal */ }
        ask(final)
      }
    }
    rec.onerror = () => { setPhase('ready'); setInterim('') }
    rec.onend = () => { setPhase(p => (p === 'listening' ? 'ready' : p)) }
    try {
      rec.start()
    } catch {
      setPhase('ready')
    }
  }, [canListen, supported, ask, SR])

  const onOrb = () => {
    if (!supported) return
    if (phase === 'speaking') {
      window.speechSynthesis.cancel()
      setPhase('ready')
      return
    }
    if (text) speak(text)
    else fetchBriefing(true)
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
          title={supported ? (phase === 'speaking' ? 'Stopp' : 'Briefing anhören') : 'Sprachausgabe wird hier nicht unterstützt'}
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
              title="Beim Öffnen der Seite automatisch begrüßen (Browser kann Ton ohne Klick blockieren)"
            >
              AUTO {armed ? 'AN' : 'AUS'}
            </button>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.55 }}>
            {phase === 'loading' && 'Briefing wird zusammengestellt …'}
            {phase === 'error' && 'Briefing konnte nicht geladen werden.'}
            {phase !== 'loading' && phase !== 'error' && (text || 'Orb antippen für das Tages-Briefing.')}
          </div>
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
            disabled={busy && phase !== 'listening'}
            aria-label="Mit Jarvis sprechen"
            title={phase === 'listening' ? 'Ich höre … (einfach sprechen)' : 'Mikro antippen und sprechen'}
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
      {!canListen && (
        <div style={{ fontSize: '0.58rem', color: '#334155', marginTop: '0.35rem' }}>
          Spracheingabe läuft am besten in Chrome — Tippen geht überall.
        </div>
      )}
    </div>
  )
}
