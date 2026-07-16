import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import StatusActions from './StatusActions'
import AiWearPhotoButton from './AiWearPhotoButton'
import ImageGallery from './ImageGallery'
import AiAdvisor from './AiAdvisor'
import CopyListing from './CopyListing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const STATUS_LABEL: Record<string, string> = {
  purchased: 'Eingekauft', checked: 'Geprüft', photographed: 'Fotografiert', listed: 'Gelistet', sold: 'Verkauft',
}
const STATUS_CLASS: Record<string, string> = {
  purchased: 'status-purchased', checked: 'status-checked', photographed: 'status-photographed', listed: 'status-listed', sold: 'status-sold',
}
const STATUS_FLOW = ['purchased', 'checked', 'photographed', 'listed', 'sold'] as const

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: item } = await supabase
    .from('items')
    .select('*')
    .eq('id', id)
    .single()

  if (!item) notFound()

  const { data: images } = await supabase
    .from('item_images')
    .select('*')
    .eq('item_id', id)
    .order('sort_order', { ascending: true })

  const { data: categories } = await supabase
    .from('categories')
    .select('name')
    .eq('id', item.category_id)
    .single()

  const { data: sources } = await supabase
    .from('sources')
    .select('name')
    .eq('id', item.source_id)
    .single()

  const categoryName = categories?.name || item.category_id
  const sourceName = sources?.name || item.source_id

  const currentStatusIndex = STATUS_FLOW.indexOf(item.status as typeof STATUS_FLOW[number])
  const nextStatus = currentStatusIndex < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentStatusIndex + 1] : null
  const prevStatus = currentStatusIndex > 0 ? STATUS_FLOW[currentStatusIndex - 1] : null

  // Check if relist is needed
  const needsRelist = item.status === 'listed' && item.listed_at && daysSince(item.listed_at) > 30
  const listedDays = item.listed_at ? daysSince(item.listed_at) : 0

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', paddingBottom: '3rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Link href="/" style={{ color: '#475569', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          ← COMMAND CENTER
        </Link>
        <span style={{ color: '#1e293b' }}>/</span>
        <Link href="/inventory" style={{ color: '#475569', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          INVENTORY
        </Link>
        <span style={{ color: '#1e293b' }}>/</span>
        <span style={{ color: '#06b6d4', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {item.name || 'Unbenannt'}
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.65rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.5rem' }}>
            {categoryName} · {sourceName}
          </div>
          <h1 style={{ fontSize: '1.5rem', margin: 0, letterSpacing: '0.05em', color: '#e0f2fe' }}>
            {item.name || 'Unbenannt'}
          </h1>
          {item.brand && (
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
              {item.brand} {item.reference_number && `· Ref. ${item.reference_number}`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {needsRelist && (
            <span style={{
              background: 'rgba(6,182,212,0.15)', color: '#06b6d4',
              padding: '0.35rem 1rem', borderRadius: '4px',
              fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}>
              🔄 RELIST NEEDED · {listedDays}d
            </span>
          )}
          <span className={`status-badge ${STATUS_CLASS[item.status] || 'status-purchased'}`} style={{ fontSize: '0.75rem', padding: '0.35rem 1rem' }}>
            {STATUS_LABEL[item.status] || item.status}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem' }}>
        <div>
          <ImageGallery initialImages={images || []} itemId={id} />

          <div className="panel" style={{ padding: '1.25rem' }}>
            <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
              DETAILS <span style={{ color: '#1e293b' }}>//</span>{' '}
              <span style={{ color: '#475569' }}>SPECIFICATIONS</span>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
              {[
                { label: 'Einkaufspreis', value: item.purchase_price ? `€${item.purchase_price.toFixed(2)}` : '—', color: '#06b6d4' },
                { label: 'Wunschpreis', value: item.target_price ? `€${item.target_price.toFixed(2)}` : '—', color: '#22c55e' },
                { label: 'Minimalpreis', value: item.min_price ? `€${item.min_price.toFixed(2)}` : '—', color: '#f97316' },
                { label: 'Nettogewinn', value: item.net_profit ? `€${item.net_profit.toFixed(2)}` : '—', color: '#22c55e' },
                { label: 'Marge', value: item.profit_margin ? `${item.profit_margin.toFixed(1)}%` : '—', color: '#c084fc' },
                { label: 'Gesamtkosten', value: item.total_cost ? `€${item.total_cost.toFixed(2)}` : '—', color: '#475569' },
                { label: 'Marke', value: item.brand || '—' },
                { label: 'Referenz', value: item.reference_number || '—' },
                { label: 'Baujahr', value: item.year ? String(item.year) : '—' },
                { label: 'Farbe', value: item.color || '—' },
                { label: 'Größe', value: item.size || '—' },
                { label: 'Ø mm', value: item.diameter_mm ? `${item.diameter_mm}mm` : '—' },
                { label: 'Material', value: item.material || '—' },
                { label: 'Uhrwerk', value: item.movement || '—' },
                { label: 'Zustand', value: item.condition_score ? `${item.condition_score}/10` : '—' },
                { label: 'Zone', value: item.zone_id || '—' },
              ].map(d => (
                <div key={d.label} style={{ background: '#050a14', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.75rem 1rem' }}>
                  <div style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.25rem' }}>{d.label}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: d.color || '#e0f2fe' }}>{d.value}</div>
                </div>
              ))}
            </div>
          </div>

          {(item.listing_title || item.listing_description) && (
            <div className="panel" style={{ padding: '1.25rem', marginTop: '1rem' }}>
              <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
                KI-TEXT <span style={{ color: '#1e293b' }}>//</span>{' '}
                <span style={{ color: '#475569' }}>LISTING</span>
              </h2>
              {item.listing_title && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.25rem' }}>Titel</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e0f2fe', lineHeight: 1.5 }}>{item.listing_title}</div>
                </div>
              )}
              {item.listing_description && (
                <div>
                  <div style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.25rem' }}>Beschreibung</div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{item.listing_description}</div>
                </div>
              )}
            </div>
          )}

          <CopyListing
            title={item.listing_title || item.name || ''}
            description={item.listing_description || ''}
            price={item.target_price ?? null}
          />
        </div>

        <div>
          <div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
            <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
              WORKFLOW <span style={{ color: '#1e293b' }}>//</span>{' '}
              <span style={{ color: '#475569' }}>STATUS</span>
            </h2>
            <StatusActions
              itemId={item.id}
              currentStatus={item.status}
              nextStatus={nextStatus}
              prevStatus={prevStatus}
            />
          </div>

          {needsRelist && (
            <div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem', border: '1px solid #06b6d4' }}>
              <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
                RELIST <span style={{ color: '#1e293b' }}>//</span>{' '}
                <span style={{ color: '#475569' }}>RENEW</span>
              </h2>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '1rem', lineHeight: 1.6 }}>
                Dieser Artikel ist seit <strong style={{ color: '#06b6d4' }}>{listedDays} Tagen</strong> gelistet. KA/Vinted-Listings verlieren nach 30 Tagen an Sichtbarkeit.
              </div>
              <StatusActions
                itemId={item.id}
                currentStatus={item.status}
                nextStatus={'photographed'}
                prevStatus={null}
              />
            </div>
          )}

          <AiAdvisor itemId={item.id} />

          <div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
            <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
              KI-FOTO <span style={{ color: '#1e293b' }}>//</span>{' '}
              <span style={{ color: '#475569' }}>GENERATOR</span>
            </h2>
            <AiWearPhotoButton itemId={item.id} />
            <div style={{ fontSize: '0.6rem', color: '#475569', marginTop: '0.5rem', textAlign: 'center' }}>
              ~$0.04 pro Bild · Gemini 3.1
            </div>
          </div>

          {item.notes && (
            <div className="panel" style={{ padding: '1.25rem' }}>
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
                NOTIZEN <span style={{ color: '#1e293b' }}>//</span>{' '}
                <span style={{ color: '#475569' }}>MEMO</span>
              </h2>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {item.notes}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
