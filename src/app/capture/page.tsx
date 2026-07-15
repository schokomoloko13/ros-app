import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import CaptureForm from './CaptureForm'

const SERVICE_KEY_MISSING = !process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY.startsWith('HIER_')

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function CapturePage() {
  let categories: { id: string; name: string; icon: string }[] = []
  let sources:    { id: string; name: string }[] = []
  let zones:      { id: string; name: string }[] = []

  if (!SERVICE_KEY_MISSING) {
    const supabase = getAdminClient()
    const [c, s, z] = await Promise.all([
      supabase.from('categories').select('id, name, icon').order('sort_order'),
      supabase.from('sources').select('id, name').order('name'),
      supabase.from('zones').select('id, name').eq('is_active', true).order('sort_order'),
    ])
    categories = c.data ?? []
    sources    = s.data ?? []
    zones      = z.data ?? []
  }

  return (
    <div style={{ minHeight: '100vh', padding: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
        <Link
          href="/"
          style={{
            color: '#475569', fontSize: '0.75rem', letterSpacing: '0.08em',
            textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}
        >
          ← COMMAND CENTER
        </Link>
        <span style={{ color: '#1e293b' }}>/</span>
        <h1 style={{ margin: 0, fontSize: '1.25rem', letterSpacing: '0.1em' }}>
          NEUER EINKAUF
        </h1>
      </div>

      {/* Form card */}
      <div style={{ maxWidth: '520px' }}>
        <div className="panel" style={{ padding: '2rem' }}>
          <div style={{ marginBottom: '1.75rem', paddingBottom: '1rem', borderBottom: '1px solid #1e293b' }}>
            <div style={{ fontSize: '0.65rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>
              Artikel erfassen
            </div>
            <div style={{ fontSize: '0.8rem', color: '#334155' }}>
              Füge einen neuen Einkauf zur Datenbank hinzu.
            </div>
          </div>
          <CaptureForm
            categories={categories ?? []}
            sources={sources ?? []}
            zones={zones ?? []}
          />
        </div>

        {SERVICE_KEY_MISSING && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' }}>
            <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700, marginBottom: '4px' }}>
              ⚠ SERVICE ROLE KEY FEHLT
            </div>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', lineHeight: 1.6 }}>
              Füge deinen Key in <code style={{ color: '#06b6d4' }}>env.local</code> ein:<br />
              <code style={{ color: '#475569' }}>SUPABASE_SERVICE_ROLE_KEY=eyJ…</code><br />
              Supabase Dashboard › Settings › API › <strong style={{ color: '#06b6d4' }}>service_role</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
