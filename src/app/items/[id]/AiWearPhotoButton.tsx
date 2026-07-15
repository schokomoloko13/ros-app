'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateWearPhoto } from './generateWearPhoto'

export default function AiWearPhotoButton({ itemId }: { itemId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setError(null)
    startTransition(async () => {
      const result = await generateWearPhoto(itemId)
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div>
      <button
        onClick={handleGenerate}
        disabled={isPending}
        style={{
          background: 'rgba(168,85,247,0.08)',
          border: '1px solid rgba(168,85,247,0.3)',
          borderRadius: '6px',
          color: '#c084fc',
          fontSize: '0.75rem',
          fontFamily: 'inherit',
          fontWeight: 600,
          letterSpacing: '0.05em',
          padding: '0.6rem 1rem',
          cursor: 'pointer',
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          width: '100%',
          justifyContent: 'center',
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? '⏳ GENERIERT…' : '🤖 KI-TRAGEBILD GENERIEREN'}
      </button>
      {error && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: '#ef4444', textAlign: 'center' }}>
          ⚠ {error}
        </div>
      )}
    </div>
  )
}