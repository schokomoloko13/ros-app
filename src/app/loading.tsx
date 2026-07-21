// Skeleton für das Dashboard: erscheint sofort beim Tippen, bis die
// Server-Komponente ihre Daten hat. Bewusst ohne echte Werte — nur die
// Silhouette des Layouts im Jarvis-Dunkel.
const box = (h: string): React.CSSProperties => ({
  height: h,
  borderRadius: '8px',
  background: 'linear-gradient(90deg, #0a1120 25%, #111c30 50%, #0a1120 75%)',
  backgroundSize: '200% 100%',
  animation: 'ros-shimmer 1.4s ease-in-out infinite',
  border: '1px solid #0f172a',
})

export default function DashboardLoading() {
  return (
    <div className="page-shell" aria-busy="true" aria-label="Lädt">
      <div className="page-head" style={{ marginBottom: '1.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...box('1.4rem'), maxWidth: '320px', marginBottom: '0.5rem' }} />
          <div style={{ ...box('0.7rem'), maxWidth: '180px' }} />
        </div>
      </div>

      <div className="r-stats-6" style={{ marginBottom: '1.5rem' }}>
        {Array.from({ length: 6 }, (_, i) => <div key={i} style={box('84px')} />)}
      </div>

      <div style={{ ...box('32px'), marginBottom: '1.25rem', maxWidth: '100%' }} />

      <div className="r-split-340" style={{ marginBottom: '1.25rem' }}>
        <div style={box('320px')} />
        <div style={box('320px')} />
      </div>

      <div style={box('160px')} />
    </div>
  )
}
