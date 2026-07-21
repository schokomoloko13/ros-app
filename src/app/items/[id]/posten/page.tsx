import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import PostFlow from './PostFlow'

// Handy-Ersatz für die Chrome-Extension: die Extension gibt es mobil nicht,
// also führt diese Seite Schritt für Schritt durch den manuellen Post.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export const dynamic = 'force-dynamic'

export default async function PostenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: item } = await supabase
    .from('items')
    .select('id, name, listing_title, listing_description, target_price')
    .eq('id', id)
    .single()

  if (!item) notFound()

  const { data: images } = await supabase
    .from('item_images')
    .select('id, url')
    .eq('item_id', id)
    .order('sort_order', { ascending: true })

  return (
    <div className="page-shell">
      <div className="crumbs" style={{ marginBottom: '1.25rem' }}>
        <Link href={`/items/${id}`} style={{ color: '#475569', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          ← ARTIKEL
        </Link>
        <span style={{ color: '#1e293b' }}>/</span>
        <span style={{ color: '#06b6d4', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          POSTEN
        </span>
      </div>

      <h1 style={{ fontSize: '1.15rem', margin: '0 0 0.35rem', letterSpacing: '0.05em', color: '#e0f2fe' }}>
        {item.listing_title || item.name || 'Unbenannt'}
      </h1>
      <p style={{ color: '#64748b', fontSize: '0.7rem', margin: '0 0 1.25rem', lineHeight: 1.6 }}>
        Vier Schritte von oben nach unten — Bilder sichern, Text kopieren, App öffnen, eintragen.
      </p>

      <PostFlow
        itemId={id}
        title={item.listing_title || item.name || ''}
        description={item.listing_description || ''}
        price={item.target_price ?? null}
        images={images || []}
      />
    </div>
  )
}
