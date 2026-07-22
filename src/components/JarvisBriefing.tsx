'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// JARVIS Orb — Tages-Briefing per Sprache (Web Speech API, deutsch).
// Holt /api/jarvis, zeigt den Text immer an, spricht auf Orb-Klick.
// AUTO (localStorage 'jarvis-armed'): versucht beim Öffnen selbst zu sprechen —
// Browser lassen Ton ohne Interaktion oft nicht zu, dann bleibt es still.
type Phase = 'idle' | 'loading' | 'ready' | 'speaking' | 'error'

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
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

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
    return () => { if (supported) window.speechSynthesis.cancel() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  return (
    <div className="panel jarvis-wrap">
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
  )
}
