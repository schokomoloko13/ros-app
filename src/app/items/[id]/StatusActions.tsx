'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateItemStatus } from './actions'

const STATUS_LABEL: Record<string, string> = {
  purchased: 'Eingekauft', checked: 'Geprüft', photographed: 'Fotografiert', listed: 'Gelistet', sold: 'Verkauft',
}

const STATUS_FLOW = ['purchased', 'checked', 'photographed', 'listed', 'sold'] as const

export default function StatusActions({
  itemId,
  currentStatus,
  nextStatus,
  prevStatus,
}: {
  itemId: string
  currentStatus: string
  nextStatus: string | null
  prevStatus: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleStatusChange(newStatus: string) {
    setError(null)
    startTransition(async () => {
      const result = await updateItemStatus(itemId, newStatus)
      if (result.ok) {
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  const currentIndex = STATUS_FLOW.indexOf(currentStatus as typeof STATUS_FLOW[number])

  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '1.25rem' }}>
        {STATUS_FLOW.map((s, i) => {
          const isActive = i <= currentIndex
          const isCurrent = i === currentIndex
          return (
            <div key={s} style={{ flex: 1, height: '4px', borderRadius: '2px', background: isActive ? (isCurrent ? '#06b6d4' : '#22c55e') : '#1e293b', transition: 'background 0.3s' }} />
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {STATUS_FLOW.map((s, i) => {
          const isCurrent = s === currentStatus
          const isPast = i < currentIndex
          const isFuture = i > currentIndex

          return (
            <div
              key={s}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.6rem 0.75rem',
                borderRadius: '6px',
                border: `1px solid ${isCurrent ? '#06b6d4' : '#1e293b'}`,
                background: isCurrent ? 'rgba(6,182,212,0.06)' : isPast ? 'rgba(34,197,94,0.04)' : 'transparent',
                opacity: isFuture ? 0.5 : 1,
              }}
            >
              <div style={{
                width: '22px', height: '22px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', fontWeight: 700,
                background: isCurrent ? '#06b6d4' : isPast ? '#22c55e' : '#1e293b',
                color: isCurrent || isPast ? '#000' : '#475569',
              }}>
                {isPast ? '✓' : i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: isCurrent ? 600 : 400, color: isCurrent ? '#06b6d4' : '#e0f2fe' }}>
                  {STATUS_LABEL[s]}
                </div>
                {isCurrent && (
                  <div style={{ fontSize: '0.6rem', color: '#475569', marginTop: '1px' }}>Aktueller Status</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        {prevStatus && (
          <button
            onClick={() => handleStatusChange(prevStatus)}
            disabled={isPending}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid #1e293b',
              borderRadius: '6px',
              color: '#475569',
              fontSize: '0.7rem',
              fontFamily: 'inherit',
              fontWeight: 600,
              letterSpacing: '0.05em',
              padding: '0.6rem',
              cursor: 'pointer',
              textTransform: 'uppercase',
              opacity: isPending ? 0.5 : 1,
            }}
          >
            ← {STATUS_LABEL[prevStatus]}
          </button>
        )}
        {nextStatus && (
          <button
            onClick={() => handleStatusChange(nextStatus)}
            disabled={isPending}
            className="btn-primary"
            style={{
              flex: 1,
              fontSize: '0.7rem',
              padding: '0.6rem',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {isPending ? 'WIRD GESPEICHERT…' : `${STATUS_LABEL[nextStatus]} →`}
          </button>
        )}
      </div>

      {error && (
        <div style={{ marginTop: '0.75rem', padding: '0.6rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', color: '#ef4444', fontSize: '0.75rem' }}>
          ⚠ {error}
        </div>
      )}
    </div>
  )
}
