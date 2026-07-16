'use client'

import { useState } from 'react'
import { getAiAdvice } from './actions'

export default function AiAdvisor({ itemId }: { itemId: string }) {
  const [tips, setTips] = useState<{ icon: string; text: string }[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async () => {
    setLoading(true)
    setError(null)
    const result = await getAiAdvice(itemId)
    setLoading(false)
    if ('error' in result) {
      setError(result.error)
    } else {
      setTips(result.tips)
    }
  }

  return (
    <div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
        KI-BERATER <span style={{ color: '#1e293b' }}>//</span>{' '}
        <span style={{ color: '#475569' }}>VERKAUFSTIPPS</span>
      </h2>

      {!tips && !loading && (
        <button
          onClick={handleAnalyze}
          style={{
            width: '100%', padding: '0.6rem',
            background: 'rgba(6,182,212,0.08)', border: '1px solid #06b6d4',
            borderRadius: '6px', color: '#06b6d4', fontSize: '0.75rem',
            fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Analyse starten
        </button>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '1.25rem', color: '#475569', fontSize: '0.75rem', letterSpacing: '0.06em' }}>
          KI analysiert...
        </div>
      )}

      {error && (
        <div style={{ color: '#ef4444', fontSize: '0.75rem', padding: '0.5rem 0' }}>{error}</div>
      )}

      {tips && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
            {tips.map((tip, i) => (
              <div key={i} style={{
                display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
                background: '#050a14', border: '1px solid #1e293b',
                borderRadius: '6px', padding: '0.55rem 0.75rem',
              }}>
                <span style={{ fontSize: '0.85rem', flexShrink: 0, lineHeight: 1.4 }}>{tip.icon}</span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.55 }}>{tip.text}</span>
              </div>
            ))}
          </div>
          <button
            onClick={handleAnalyze}
            style={{
              background: 'transparent', border: 'none', color: '#334155',
              fontSize: '0.65rem', cursor: 'pointer', letterSpacing: '0.06em',
              textTransform: 'uppercase', fontFamily: 'inherit', padding: 0,
            }}
          >
            Neu analysieren →
          </button>
        </>
      )}
    </div>
  )
}
