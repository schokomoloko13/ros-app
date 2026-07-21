'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export type MonthPoint = {
  key: string
  label: string
  firstDay: string
  lastDay: string
  umsatz: number
  ausgaben: number
  gewinn: number
}

const W = 720
const H = 150
const PAD_L = 8
const PAD_R = 8
const PAD_T = 16
const PAD_B = 24

const eur0 = (n: number) =>
  '€' + n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export default function FinanceChart({
  months,
  activeFrom,
  activeTo,
}: {
  months: MonthPoint[]
  activeFrom?: string
  activeTo?: string
}) {
  const router = useRouter()
  const svgRef = useRef<SVGSVGElement>(null)
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null)
  const dragFrom = useRef<number | null>(null)
  const dragged = useRef(false)

  const n = months.length
  const innerW = W - PAD_L - PAD_R
  const step = innerW / n
  const maxV = Math.max(1, ...months.map(m => Math.max(m.umsatz, m.ausgaben)))
  const maxG = Math.max(1, ...months.map(m => Math.abs(m.gewinn)))
  const barH = (v: number) => ((H - PAD_T - PAD_B) * v) / maxV
  const barW = Math.min(13, step / 3.2)

  function idxAt(clientX: number): number {
    const svg = svgRef.current
    if (!svg) return 0
    const r = svg.getBoundingClientRect()
    const x = ((clientX - r.left) / r.width) * W
    return Math.max(0, Math.min(n - 1, Math.floor((x - PAD_L) / step)))
  }

  function down(e: React.PointerEvent) {
    try { svgRef.current?.setPointerCapture?.(e.pointerId) } catch (_) {}
    dragFrom.current = idxAt(e.clientX)
    dragged.current = false
    setSel(null)
  }

  function move(e: React.PointerEvent) {
    if (dragFrom.current === null) return
    const i = idxAt(e.clientX)
    if (i !== dragFrom.current) dragged.current = true
    setSel({ a: Math.min(dragFrom.current, i), b: Math.max(dragFrom.current, i) })
  }

  function up(e: React.PointerEvent) {
    if (dragFrom.current === null) return
    const a = dragFrom.current
    const b = idxAt(e.clientX)
    dragFrom.current = null
    setSel(null)
    if (!dragged.current || a === b) {
      router.push(`/finanzen?v=monat&d=${months[a].firstDay}`)
    } else {
      router.push(
        `/finanzen?v=frei&from=${months[Math.min(a, b)].firstDay}&to=${months[Math.max(a, b)].lastDay}`
      )
    }
  }

  const inActive = (m: MonthPoint) =>
    activeFrom && activeTo ? m.lastDay >= activeFrom && m.firstDay <= activeTo : false

  // Gewinn-Linie auf eigenem Maßstab um die Mittelachse
  const midY = PAD_T + (H - PAD_T - PAD_B) / 2
  const gY = (g: number) => midY - (g / maxG) * ((H - PAD_T - PAD_B) / 2)
  const gPoints = months.map((m, i) => `${PAD_L + i * step + step / 2},${gY(m.gewinn)}`).join(' ')

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{
        width: '100%',
        height: 'auto',
        display: 'block',
        touchAction: 'pan-y',
        cursor: 'crosshair',
        userSelect: 'none',
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
    >
      {/* aktiver Zeitraum (nur Frei-Modus) als Unterstreichung */}
      {months.map((m, i) =>
        inActive(m) ? (
          <rect
            key={'a' + m.key}
            x={PAD_L + i * step + 1}
            y={H - PAD_B + 6}
            width={step - 2}
            height={3}
            fill="rgba(6,182,212,0.7)"
            rx={1}
          />
        ) : null
      )}

      {/* Null-Linie Gewinn */}
      <line x1={PAD_L} x2={W - PAD_R} y1={midY} y2={midY} stroke="#1e293b" strokeDasharray="3 4" strokeWidth={1} />

      {months.map((m, i) => {
        const cx = PAD_L + i * step + step / 2
        return (
          <g key={m.key}>
            <rect
              x={cx - barW - 1}
              y={H - PAD_B - barH(m.umsatz)}
              width={barW}
              height={Math.max(1, barH(m.umsatz))}
              fill="#22c55e"
              opacity={0.9}
              rx={1.5}
            >
              <title>{`${m.label}: Umsatz ${eur0(m.umsatz)}`}</title>
            </rect>
            <rect
              x={cx + 1}
              y={H - PAD_B - barH(m.ausgaben)}
              width={barW}
              height={Math.max(1, barH(m.ausgaben))}
              fill="#f97316"
              opacity={0.9}
              rx={1.5}
            >
              <title>{`${m.label}: Ausgaben ${eur0(m.ausgaben)}`}</title>
            </rect>
            <text x={cx} y={H - 8} textAnchor="middle" fontSize="9" fill="#475569" fontFamily="monospace">
              {m.label}
            </text>
          </g>
        )
      })}

      {/* Gewinn-Linie */}
      <polyline points={gPoints} fill="none" stroke="#06b6d4" strokeWidth={1.5} opacity={0.85} />
      {months.map((m, i) => (
        <circle key={'g' + m.key} cx={PAD_L + i * step + step / 2} cy={gY(m.gewinn)} r={2} fill="#06b6d4">
          <title>{`${m.label}: Gewinn ${eur0(m.gewinn)}`}</title>
        </circle>
      ))}

      {/* Drag-Auswahl */}
      {sel && (
        <rect
          x={PAD_L + sel.a * step}
          y={PAD_T - 6}
          width={(sel.b - sel.a + 1) * step}
          height={H - PAD_T - PAD_B + 12}
          fill="rgba(6,182,212,0.12)"
          stroke="rgba(6,182,212,0.6)"
          strokeWidth={1}
          rx={3}
        />
      )}

      {/* Legende */}
      <g fontSize="9" fontFamily="monospace">
        <rect x={PAD_L} y={2} width={8} height={8} fill="#22c55e" rx={1.5} />
        <text x={PAD_L + 11} y={9} fill="#64748b">Umsatz</text>
        <rect x={PAD_L + 58} y={2} width={8} height={8} fill="#f97316" rx={1.5} />
        <text x={PAD_L + 69} y={9} fill="#64748b">Ausgaben</text>
        <line x1={PAD_L + 122} x2={PAD_L + 134} y1={6} y2={6} stroke="#06b6d4" strokeWidth={1.5} />
        <text x={PAD_L + 138} y={9} fill="#64748b">Gewinn</text>
      </g>
    </svg>
  )
}
