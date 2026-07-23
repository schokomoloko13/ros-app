import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const revalidate = 30
import StatusActions from './StatusActions'
import AiWearPhotoButton from './AiWearPhotoButton'
import ImageGallery from './ImageGallery'
import WatchPriceCheck from './WatchPriceCheck'
import CopyListing from './CopyListing'
import PostToKaButton from './PostToKaButton'
import EditDetails from './EditDetails'

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

  // Lookup-Listen für Anzeige + Bearbeiten-Dropdowns
  const { data: categoryList } = await supabase.from('categories').select('id, name').order('name')
  const { data: sourceList }   = await supabase.from('sources').select('id, name').order('name')
  const { data: zoneList }     = await supabase.from('zones').select('id, name').order('name')

  // M3.5: Plattform-Inserate (KA/Vinted) — Tabelle fehlt ggf. noch → dann leer
  const { data: platformListings } = await supabase
    .from('platform_listings')
    .select('platform, status, listed_at, listing_url, platform_account_id, detected_account')
    .eq('item_id', id)
    .order('listed_at', { ascending: false })

  // Über welches Konto wurde gepostet? platform_account_id ist die
  // verlässliche Quelle, detected_account nur der rohe Erkennungstext.
  const { data: accountList } = await supabase
    .from('platform_accounts')
    .select('id, account_name, ka_username')

  const accountLabel = (pl: any): string | null => {
    const acc = accountList?.find((a: any) => a.id === pl.platform_account_id)
    const name = acc?.account_name || acc?.ka_username || pl.detected_account
    return name ? String(name).toUpperCase() : null
  }

  const categoryName = categoryList?.find((c: any) => c.id === item.category_id)?.name || item.category_id
  const sourceName = sourceList?.find((s: any) => s.id === item.source_id)?.name || item.source_id

  const currentStatusIndex = STATUS_FLOW.indexOf(item.status as typeof STATUS_FLOW[number])
  const nextStatus = currentStatusIndex < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentStatusIndex + 1] : null
  const prevStatus = currentStatusIndex > 0 ? STATUS_FLOW[currentStatusIndex - 1] : null

  // Check if relist is needed
  const needsRelist = item.status === 'listed' && item.listed_at && daysSince(item.listed_at) > 30
  const listedDays = item.listed_at ? daysSince(item.listed_at) : 0

  return (
    <div className="page-shell">
      <div className="crumbs" style={{ marginBottom: '1.5rem' }}>
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

      <div className="r-split-380">
        <div>
          <ImageGallery initialImages={images || []} itemId={id} />

          <EditDetails
            item={item}
            categories={categoryList || []}
            sources={sourceList || []}
            zones={zoneList || []}
          />

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
          <PostToKaButton itemId={item.id} hasListing={!!item.listing_title} />

          {platformListings && platformListings.length > 0 && (
            <div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
              <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
                LIVE AUF <span style={{ color: '#1e293b' }}>//</span>{' '}
                <span style={{ color: '#475569' }}>PLATTFORMEN</span>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {platformListings.map((pl: any) => {
                  const isKa = pl.platform === 'kleinanzeigen'
                  const color = isKa ? '#06b6d4' : '#c084fc'
                  const label = isKa ? 'KLEINANZEIGEN' : String(pl.platform).toUpperCase()
                  const days = daysSince(pl.listed_at)
                  const konto = accountLabel(pl)
                  const inner = (
                    <>
                      <span style={{ color, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.08em' }}>
                        {label}
                        {konto && <span style={{ color: '#64748b', fontWeight: 400 }}> · {konto}</span>}
                      </span>
                      <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                        seit {new Date(pl.listed_at).toLocaleDateString('de-DE')} · {days}d
                      </span>
                    </>
                  )
                  return pl.listing_url ? (
                    <a key={pl.platform} href={pl.listing_url} target="_blank" rel="noreferrer"
                       style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#050a14', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.6rem 1rem', textDecoration: 'none' }}>
                      {inner}
                    </a>
                  ) : (
                    <div key={pl.platform}
                         style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#050a14', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.6rem 1rem' }}>
                      {inner}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

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
              targetPrice={item.target_price}
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

          <WatchPriceCheck itemId={item.id} existingImages={(images || []).filter((img: any) => img.url).map((img: any) => ({ url: img.url }))} />

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
