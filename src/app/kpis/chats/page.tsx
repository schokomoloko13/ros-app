import Link from 'next/link'

export default function ChatsPage() {
  return (
    <div className="page-shell">
      <Link href="/" style={{ color: '#475569', fontSize: '0.75rem', letterSpacing: '0.08em', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.5rem' }}>
        ← COMMAND CENTER
      </Link>

      <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.25rem', letterSpacing: '0.1em' }}>OPEN CHATS</h1>
      <p style={{ color: '#475569', fontSize: '0.75rem', margin: '0 0 2rem' }}>
        Offene Käufer-Anfragen auf Kleinanzeigen und Vinted.
      </p>

      <div className="panel" style={{ padding: '3rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.4 }}>💬</div>
        <div style={{ color: '#06b6d4', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
          NOCH KEINE PLATTFORM-INTEGRATION
        </div>
        <div style={{ color: '#475569', fontSize: '0.78rem', lineHeight: 1.7, maxWidth: '400px', margin: '0 auto' }}>
          Chat-Daten werden direkt von Kleinanzeigen und Vinted gezogen.
          Die API-Integration ist in Planung.
        </div>
        <div style={{ marginTop: '2rem', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {['Kleinanzeigen API', 'Vinted Webhooks', 'Chat-Sync'].map(label => (
            <span key={label} style={{
              background: 'rgba(6,182,212,0.06)', border: '1px solid #1e293b',
              borderRadius: '4px', padding: '0.25rem 0.75rem',
              fontSize: '0.65rem', color: '#334155', letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
