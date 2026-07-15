'use client'

import { useState, useTransition, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { captureItem } from './actions'
import { generateListingText } from './generate'

const MAX_PHOTOS = 8
const MAX_MB     = 10

type Option = { id: string; name: string; icon?: string }
type AiStatus = 'idle' | 'loading' | 'done' | 'error'

const MOVEMENT_OPTIONS = ['Automatik', 'Handaufzug', 'Quartz', 'Elektronisch', 'Sonstiges']

const CONDITION_OPTIONS = [
  { value: 1,  label: '1 — Defekt / nicht funktionsfähig' },
  { value: 2,  label: '2 — Stark beschädigt' },
  { value: 3,  label: '3 — Sichtbare Mängel' },
  { value: 4,  label: '4 — Gebrauchsspuren' },
  { value: 5,  label: '5 — Befriedigend' },
  { value: 6,  label: '6 — Gut' },
  { value: 7,  label: '7 — Sehr gut' },
  { value: 8,  label: '8 — Fast neuwertig' },
  { value: 9,  label: '9 — Wie neu' },
  { value: 10, label: '10 — Neuwertig / ungetragen' },
]

const CTX_KEYS = ['name','brand','reference_number','year','color','size','diameter_mm','material','movement','condition_score','notes'] as const
const CTX_LABEL: Record<string, string> = {
  name: 'artikel', brand: 'marke', reference_number: 'ref', year: 'bj',
  color: 'farbe', size: 'größe', diameter_mm: 'ø', material: 'material',
  movement: 'uhrwerk', condition_score: 'zustand', notes: 'notizen',
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.75rem 0 0' }}>
      <div style={{ flex: 1, height: '1px', background: '#1e293b' }} />
      <span style={{ fontSize: '0.6rem', color: '#334155', letterSpacing: '0.15em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '1px', background: '#1e293b' }} />
    </div>
  )
}

function Opt() {
  return <span style={{ color: '#334155', fontWeight: 400, marginLeft: '0.25rem' }}>(opt.)</span>
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button
      type="button"
      onClick={copy}
      style={{
        background: copied ? 'rgba(34,197,94,0.1)' : 'transparent',
        border: `1px solid ${copied ? '#22c55e' : '#1e3a5f'}`,
        borderRadius: '4px',
        color: copied ? '#4ade80' : '#475569',
        fontSize: '0.6rem',
        fontFamily: 'inherit',
        letterSpacing: '0.08em',
        padding: '0.2rem 0.5rem',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {copied ? '✓ KOPIERT' : 'KOPIEREN'}
    </button>
  )
}

export default function CaptureForm({
  categories,
  sources,
  zones,
}: {
  categories: Option[]
  sources: Option[]
  zones: Option[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const fileInputRef                        = useRef<HTMLInputElement>(null)
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews]   = useState<string[]>([])
  const [dragOver, setDragOver]             = useState(false)

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const valid = Array.from(incoming).filter(
      f => f.type.startsWith('image/') && f.size <= MAX_MB * 1024 * 1024
    )
    setSelectedPhotos(prev => {
      const next = [...prev, ...valid].slice(0, MAX_PHOTOS)
      setPhotoPreviews(next.map(f => URL.createObjectURL(f)))
      return next
    })
  }, [])

  function removePhoto(index: number) {
    setSelectedPhotos(prev => {
      const next = prev.filter((_, i) => i !== index)
      setPhotoPreviews(next.map(f => URL.createObjectURL(f)))
      return next
    })
  }

  const [aiStatus, setAiStatus]   = useState<AiStatus>('idle')
  const [aiError, setAiError]     = useState('')
  const [aiCtx, setAiCtx]         = useState<Record<string, string>>({})
  const [aiTitle, setAiTitle]     = useState('')
  const [aiDesc, setAiDesc]       = useState('')

  async function handleAiGenerate() {
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    const ctx: Record<string, string> = {}
    for (const key of CTX_KEYS) {
      const val = (fd.get(key) as string)?.trim()
      if (val) ctx[key] = val
    }
    setAiCtx(ctx)
    setAiStatus('loading')
    const result = await generateListingText(ctx)
    if (result.ok) {
      setAiTitle(result.title)
      setAiDesc(result.description)
      setAiStatus('done')
    } else {
      setAiError(result.error)
      setAiStatus('error')
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    for (const file of selectedPhotos) {
      formData.append('photos', file)
    }
    formData.append('listing_title', aiTitle)
    formData.append('listing_description', aiDesc)
    startTransition(async () => {
      const result = await captureItem(formData)
      if (result.ok) {
        photoPreviews.forEach(url => URL.revokeObjectURL(url))
        setSuccess(true)
        setTimeout(() => router.push('/'), 1200)
      } else {
        setError(result.error)
      }
    })
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</div>
        <div style={{ color: '#4ade80', fontSize: '1rem', fontWeight: 700, letterSpacing: '0.08em' }}>
          ARTIKEL GESPEICHERT
        </div>
        <div style={{ color: '#475569', fontSize: '0.75rem', marginTop: '0.5rem' }}>
          Zurück zum Command Center…
        </div>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      <div>
        <label className="form-label">Artikel-Name</label>
        <input name="name" type="text" className="form-input" placeholder="z.B. Omega Seamaster 300" required autoFocus />
      </div>

      <div>
        <label className="form-label">Kategorie</label>
        <select name="category_id" className="form-input" required defaultValue="">
          <option value="" disabled>— wählen —</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <div>
          <label className="form-label">Einkaufspreis (€)</label>
          <div style={{ position: 'relative' }}>
            <EuroSign />
            <input name="purchase_price" type="number" min="0" step="0.01" className="form-input" placeholder="0.00" style={{ paddingLeft: '1.75rem' }} required />
          </div>
        </div>
        <div>
          <label className="form-label">Wunschpreis (€) <Opt /></label>
          <div style={{ position: 'relative' }}>
            <EuroSign />
            <input name="target_price" type="number" min="0" step="0.01" className="form-input" placeholder="z.B. 120" style={{ paddingLeft: '1.75rem' }} />
          </div>
        </div>
        <div>
          <label className="form-label">Minimalpreis (€) <Opt /></label>
          <div style={{ position: 'relative' }}>
            <EuroSign />
            <input name="min_price" type="number" min="0" step="0.01" className="form-input" placeholder="z.B. 85" style={{ paddingLeft: '1.75rem' }} />
          </div>
          <div style={{ fontSize: '0.6rem', color: '#334155', marginTop: '0.35rem' }}>Preis, bei dem ich auch verkaufe</div>
        </div>
      </div>

      <div>
        <label className="form-label">Quelle</label>
        <select name="source_id" className="form-input" required defaultValue="">
          <option value="" disabled>— wählen —</option>
          {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div>
        <label className="form-label">Lager-Zone <Opt /></label>
        <select name="zone_id" className="form-input" defaultValue="">
          <option value="">— keine Zone —</option>
          {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          {zones.length === 0 && <option value="" disabled>Keine Zonen angelegt</option>}
        </select>
      </div>

      <SectionDivider label="DETAILS" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label className="form-label">Marke <Opt /></label>
          <input name="brand" type="text" className="form-input" placeholder="z.B. Omega, Rolex, Levi's" />
        </div>
        <div>
          <label className="form-label">Referenz / Modellnummer <Opt /></label>
          <input name="reference_number" type="text" className="form-input" placeholder="z.B. 168.0001" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <div>
          <label className="form-label">Baujahr <Opt /></label>
          <input name="year" type="number" min="1800" max="2099" className="form-input" placeholder="z.B. 1968" />
        </div>
        <div>
          <label className="form-label">Farbe <Opt /></label>
          <input name="color" type="text" className="form-input" placeholder="z.B. Silber, Navy" />
        </div>
        <div>
          <label className="form-label">Größe <Opt /></label>
          <input name="size" type="text" className="form-input" placeholder="z.B. 42mm, M, L" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <div>
          <label className="form-label">Ø Durchmesser mm <Opt /></label>
          <input name="diameter_mm" type="number" min="0" step="0.5" className="form-input" placeholder="z.B. 36" />
        </div>
        <div>
          <label className="form-label">Uhrwerk <Opt /></label>
          <select name="movement" className="form-input" defaultValue="">
            <option value="">— wählen —</option>
            {MOVEMENT_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Zustand <Opt /></label>
          <select name="condition_score" className="form-input" defaultValue="">
            <option value="">— wählen —</option>
            {CONDITION_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="form-label">Material <Opt /></label>
        <input name="material" type="text" className="form-input" placeholder="z.B. Stahl, Leder, Gold — mehrere mit Komma trennen" />
      </div>

      <SectionDivider label="NOTIZEN" />

      <div>
        <label className="form-label">
          Notizen <Opt />
          <span style={{ color: '#1e3a5f', marginLeft: '0.5rem', fontSize: '0.6rem' }}>// fließt in KI-Text ein</span>
        </label>
        <textarea name="notes" rows={4} className="form-input" placeholder="Besonderheiten, Mängel, Geschichte des Artikels…" style={{ resize: 'vertical', lineHeight: 1.6 }} />
      </div>

      <SectionDivider label="FOTOS" />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
      />

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) addFiles(e.dataTransfer.files) }}
        style={{
          border: `1px dashed ${dragOver ? '#06b6d4' : '#1e3a5f'}`,
          borderRadius: '8px',
          padding: '1.5rem 1rem',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? 'rgba(6,182,212,0.04)' : 'transparent',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem', opacity: 0.5 }}>📷</div>
        <div style={{ fontSize: '0.75rem', color: '#475569' }}>
          Fotos hierher ziehen oder <span style={{ color: '#06b6d4' }}>klicken</span>
        </div>
        <div style={{ fontSize: '0.6rem', color: '#334155', marginTop: '0.25rem' }}>
          bis zu {MAX_PHOTOS} Bilder · max. {MAX_MB} MB pro Datei
        </div>
      </div>

      {selectedPhotos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
          {selectedPhotos.map((_, i) => (
            <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: '6px', overflow: 'hidden', border: `1px solid ${i === 0 ? '#06b6d4' : '#1e293b'}` }}>
              <img
                src={photoPreviews[i]}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {i === 0 && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(6,182,212,0.85)', fontSize: '0.5rem', color: '#000', fontWeight: 700, letterSpacing: '0.1em', textAlign: 'center', padding: '0.15rem' }}>
                  TITELBILD
                </div>
              )}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); removePhoto(i) }}
                style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', color: '#fff', width: '18px', height: '18px', fontSize: '0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <SectionDivider label="KI-TEXT" />

      <button
        type="button"
        onClick={handleAiGenerate}
        disabled={aiStatus === 'loading'}
        style={{
          background: aiStatus === 'loading' ? 'rgba(59,130,246,0.06)' : 'transparent',
          border: `1px solid ${aiStatus === 'loading' ? '#3b82f6' : '#1e3a5f'}`,
          borderRadius: '6px',
          color: aiStatus === 'loading' ? '#60a5fa' : '#60a5fa',
          fontSize: '0.8rem',
          fontFamily: 'inherit',
          fontWeight: 600,
          letterSpacing: '0.06em',
          padding: '0.7rem 1rem',
          cursor: aiStatus === 'loading' ? 'wait' : 'pointer',
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          justifyContent: 'center',
          transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
          width: '100%',
        }}
      >
        {aiStatus === 'loading' ? (
          <>⏳ GENERIERT…</>
        ) : (
          <>🤖 {aiStatus === 'done' ? 'NEU GENERIEREN' : 'KI-TEXT GENERIEREN'}</>
        )}
      </button>

      {aiStatus === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[80, 60, 95, 70, 85].map((w, i) => (
            <div key={i} style={{
              height: '10px', width: `${w}%`, borderRadius: '4px',
              background: 'linear-gradient(90deg, #0a1120 25%, #1e3a5f 50%, #0a1120 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.4s infinite',
              opacity: 0.6,
            }} />
          ))}
        </div>
      )}

      {aiStatus === 'error' && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', padding: '0.75rem 1rem', color: '#ef4444', fontSize: '0.75rem' }}>
          ⚠ {aiError}
        </div>
      )}

      {aiStatus === 'done' && (
        <div style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid #1e3a5f', borderRadius: '8px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.6rem', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700, whiteSpace: 'nowrap' }}>
              🤖 KI-ENTWURF
            </span>
            {Object.entries(aiCtx).map(([k, v]) => (
              <span key={k} style={{
                background: 'rgba(59,130,246,0.08)', border: '1px solid #1e3a5f',
                borderRadius: '3px', padding: '0.1rem 0.4rem',
                fontSize: '0.55rem', color: '#475569', letterSpacing: '0.03em',
              }}>
                {CTX_LABEL[k] ?? k}: {v.length > 20 ? v.slice(0, 18) + '…' : v}
              </span>
            ))}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Titel <span style={{ color: '#334155' }}>({aiTitle.length}/70)</span></label>
              <CopyButton text={aiTitle} />
            </div>
            <input
              type="text"
              value={aiTitle}
              onChange={e => setAiTitle(e.target.value)}
              maxLength={70}
              className="form-input"
              style={{ fontWeight: 600, color: '#e0f2fe' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Beschreibung</label>
              <CopyButton text={aiDesc} />
            </div>
            <textarea
              value={aiDesc}
              onChange={e => setAiDesc(e.target.value)}
              rows={8}
              className="form-input"
              style={{ resize: 'vertical', lineHeight: 1.7, color: '#94a3b8' }}
            />
          </div>

        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '0.75rem 1rem', color: '#ef4444', fontSize: '0.8rem' }}>
          ⚠ {error}
        </div>
      )}

      <button
        type="submit"
        className="btn-primary"
        disabled={isPending}
        style={{ marginTop: '0.5rem', opacity: isPending ? 0.6 : 1, width: '100%', padding: '0.9rem' }}
      >
        {isPending ? 'WIRD GESPEICHERT…' : '+ ARTIKEL ERFASSEN'}
      </button>
    </form>
  )
}

function EuroSign() {
  return (
    <span style={{
      position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
      color: '#06b6d4', fontSize: '0.9rem', fontWeight: 700, pointerEvents: 'none',
    }}>€</span>
  )
}