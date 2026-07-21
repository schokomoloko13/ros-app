// Skeleton für /inventory — spiegelt das Kachelraster, damit beim Wechsel
// nichts springt (mobil vier pro Reihe, Desktop auto-fill).
const box = (h: string): React.CSSProperties => ({
  height: h,
  borderRadius: '8px',
  background: 'linear-gradient(90deg, #0a1120 25%, #111c30 50%, #0a1120 75%)',
  backgroundSize: '200% 100%',
  animation: 'ros-shimmer 1.4s ease-in-out infinite',
  border: '1px solid #0f172a',
})

export default function InventoryLoading() {
  return (
    <div className="page-shell" aria-busy="true" aria-label="Lädt">
      <div className="page-head" style={{ marginBottom: '1.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...box('1.4rem'), maxWidth: '220px', marginBottom: '0.5rem' }} />
          <div style={{ ...box('0.7rem'), maxWidth: '160px' }} />
        </div>
      </div>

      <div style={{ ...box('40px'), marginBottom: '1rem' }} />

      <div className="card-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '1rem',
      }}>
        {Array.from({ length: 12 }, (_, i) => <div key={i} style={box('230px')} />)}
      </div>
    </div>
  )
}
