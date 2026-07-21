import { createClient } from '@supabase/supabase-js'
import ShowcaseGrid from './ShowcaseGrid'

// SCHaufenster (/schaufenster) — kundenfähige Ansicht des verfügbaren Bestands.
// Zeigt NUR: Fotos, Name, Specs, Verkaufspreis. Niemals: EK, Ausgaben, Margen,
// interne Links. Öffnet bewusst in einem neuen Fenster (Button auf /inventory
// und /), diese Seite hat keinerlei Navigation zurück in die App.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export const revalidate = 30
export const metadata = {
  title: 'R.O.S. Auswahl',
  robots: 'noindex, nofollow',
}

export default async function SchaufensterPage() {
  const { data: items } = await supabase
    .from('items')
    .select('id, name, brand, reference_number, year, color, size, diameter_mm, material, movement, condition_score, target_price')
    .in('status', ['photographed', 'listed'])
    .order('created_at', { ascending: false })

  const ids = (items || []).map(i => i.id)
  const { data: images } = ids.length
    ? await supabase
        .from('item_images')
        .select('item_id, url, is_primary, sort_order')
        .in('item_id', ids)
        .order('sort_order', { ascending: true })
    : { data: [] }

  const byItem = new Map<string, any[]>()
  for (const img of images || []) {
    if (!byItem.has(img.item_id)) byItem.set(img.item_id, [])
    byItem.get(img.item_id)!.push(img)
  }

  const payload = (items || []).map(i => ({
    ...i,
    images: (byItem.get(i.id) || [])
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
      .map(x => x.url as string),
  }))

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.4rem', margin: 0, letterSpacing: '0.08em' }}>
          R.O.S. <span style={{ color: '#475569' }}>AUSWAHL</span>
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
          {payload.length} Artikel verfügbar · Antippen für Details
        </p>
      </div>

      {payload.length === 0 ? (
        <div style={{ color: '#475569', fontSize: '0.85rem' }}>
          Aktuell nichts verfügbar.
        </div>
      ) : (
        <ShowcaseGrid items={payload} />
      )}
    </div>
  )
}
