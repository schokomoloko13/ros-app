'use client'

import { useRef, useState } from 'react'
import {
  detectWatch,
  researchPrice,
  applyWatchValues,
  type WatchDetection,
  type PriceResearch,
} from './watchPrice'

type ExistingImage = { url: string }
type Phase = 'select' | 'detecting' | 'confirm' | 'researching' | 'result'

const ACCENT = '#06b6d4'
const CARD_BG = '#050a14'
const BORDER = '#1e293b'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.45rem 0.6rem', background: CARD_BG,
  border: `1px solid ${BORDER}`, borderRadius: '5px', color: '#e0f2fe',
  fontSize: '0.8rem', fontFamily: 'inherit',
}
const labelStyle: React.CSSProperties = {
  fontSize: '0.58rem', color: '#475569', textTransform: 'uppercase',
  letterSpacing: '0.1em', marginBottom: '0.2rem', display: 'block',
}
const primaryBtn: React.CSSProperties = {
  width: '100%', padding: '0.6rem', background: 'rgba(6,182,212,0.08)',
  border: `1px solid ${ACCENT}`, borderRadius: '6px', color: ACCENT,
  fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
}

function eur(n: number | null): string {
  return n == null ? '—' : `€${n.toLocaleString('de-DE')}`
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
    r.readAsDataURL(file)
  })
}

export default function WatchPriceCheck({
  itemId,
  existingImages,
}: {
  itemId: string
  existingImages: ExistingImage[]
}) {
  const [phase, setPhase] = useState<Phase>('select')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Foto-Auswahl: vorhandene URLs + hochgeladene data-URLs
  const [selected, setSelected] = useState<string[]>(
    existingImages.slice(0, 1).map((i) => i.url)
  )
  const [uploads, setUploads] = useState<string[]>([])

  const [detection, setDetection] = useState<WatchDetection | null>(null)
  const [research, setResearch] = useState<PriceResearch | null>(null)
  const [applied, setApplied] = useState(false)

  const allChosen = [...selected, ...uploads]

  const toggle = (url: string) => {
    setSelected((prev) => {
      if (prev.includes(url)) return prev.filter((u) => u !== url)
      if (prev.length + uploads.length >= 3) return prev
      return [...prev, url]
    })
  }

  const onUpload = async (files: FileList | null) => {
    if (!files) return
    const room = 3 - allChosen.length
    const picked = Array.from(files).slice(0, Math.max(0, room))
    const urls = await Promise.all(picked.map(fileToDataUrl))
    setUploads((prev) => [...prev, ...urls].slice(0, 3))
  }

  const runDetect = async () => {
    if (allChosen.length === 0) { setError('Bitte mindestens ein Foto wählen.'); return }
    setError(null)
    setPhase('detecting')
    const res = await detectWatch(allChosen)
    if (!res.ok) { setError(res.error); setPhase('select'); return }
    setDetection(res.detection)
    setPhase('confirm')
  }

  const runResearch = async () => {
    if (!detection) return
    setError(null)
    setPhase('researching')
    const res = await researchPrice({
      brand: detection.brand,
      model: detection.model,
      reference: detection.reference,
      year: detection.year,
      itemId,
    })
    if (!res.ok) { setError(res.error); setPhase('confirm'); return }
    setResearch(res.research)
    setPhase('result')
  }

  const applyValues = async () => {
    if (!detection) return
    const res = await applyWatchValues(itemId, {
      brand: detection.brand,
      reference: detection.reference,
      year: detection.year,
      caliber: detection.caliber,
      targetPrice: research?.soldMedian ?? null,
    })
    if (res.ok) setApplied(true)
    else setError(res.error)
  }

  const reset = () => {
    setDetection(null); setResearch(null); setApplied(false)
    setUploads([]); setError(null); setPhase('select')
  }

  const editField = (key: keyof WatchDetection, value: string) =>
    setDetection((d) => (d ? { ...d, [key]: value } : d))

  return (
    <div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
        UHR ERKENNEN <span style={{ color: BORDER }}>//</span>{' '}
        <span style={{ color: '#475569' }}>MARKTPREIS</span>
      </h2>

      {error && (
        <div style={{ color: '#ef4444', fontSize: '0.75rem', padding: '0.5rem 0' }}>{error}</div>
      )}

      {/* ── Schritt 1: Foto-Auswahl ── */}
      {phase === 'select' && (
        <>
          {existingImages.length > 0 && (
            <>
              <span style={labelStyle}>Vorhandene Fotos (max. 3)</span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {existingImages.map((img) => {
                  const on = selected.includes(img.url)
                  return (
                    <button key={img.url} onClick={() => toggle(img.url)} style={{
                      padding: 0, border: `2px solid ${on ? ACCENT : BORDER}`,
                      borderRadius: '6px', overflow: 'hidden', cursor: 'pointer',
                      background: 'none', lineHeight: 0, position: 'relative',
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt="" style={{ width: 56, height: 56, objectFit: 'cover' }} />
                      {on && (
                        <span style={{
                          position: 'absolute', top: 2, right: 2, background: ACCENT,
                          color: '#001018', borderRadius: '50%', width: 16, height: 16,
                          fontSize: '0.6rem', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontWeight: 700,
                        }}>✓</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {uploads.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {uploads.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={u} alt="" style={{
                  width: 56, height: 56, objectFit: 'cover',
                  borderRadius: '6px', border: `2px solid ${ACCENT}`,
                }} />
              ))}
            </div>
          )}

          <input
            ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => onUpload(e.target.files)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            style={{ ...primaryBtn, background: 'transparent', marginBottom: '0.5rem' }}
          >
            + Foto hochladen
          </button>
          <button onClick={runDetect} style={primaryBtn} disabled={allChosen.length === 0}>
            Uhr erkennen &amp; Marktpreis
          </button>
        </>
      )}

      {(phase === 'detecting' || phase === 'researching') && (
        <div style={{ textAlign: 'center', padding: '1.25rem', color: '#475569', fontSize: '0.75rem', letterSpacing: '0.06em' }}>
          {phase === 'detecting' ? 'KI erkennt die Uhr…' : 'Suche verkaufte Exemplare…'}
        </div>
      )}

      {/* ── Schritt 2: Bestätigung / Korrektur ── */}
      {phase === 'confirm' && detection && (
        <>
          <div style={{
            fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.75rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>Erkannte Daten prüfen &amp; korrigieren</span>
            <span style={{ color: detection.confidence >= 0.66 ? '#22c55e' : detection.confidence >= 0.4 ? '#eab308' : '#ef4444' }}>
              {Math.round(detection.confidence * 100)}% sicher
            </span>
          </div>

          {detection.hint && (
            <div style={{
              fontSize: '0.7rem', color: '#eab308', background: 'rgba(234,179,8,0.08)',
              border: '1px solid rgba(234,179,8,0.3)', borderRadius: '5px',
              padding: '0.4rem 0.6rem', marginBottom: '0.75rem',
            }}>
              ⚠ {detection.hint}
            </div>
          )}

          <div style={{ display: 'grid', gap: '0.55rem', marginBottom: '0.9rem' }}>
            {([
              ['brand', 'Marke'], ['model', 'Modell'], ['reference', 'Referenz'],
              ['year', 'Baujahr'], ['caliber', 'Kaliber'], ['condition', 'Zustand'],
              ['notable', 'Besonderheiten'],
            ] as [keyof WatchDetection, string][]).map(([key, lbl]) => (
              <div key={key}>
                <label style={labelStyle}>{lbl}</label>
                <input
                  style={inputStyle}
                  value={String(detection[key] ?? '')}
                  onChange={(e) => editField(key, e.target.value)}
                />
              </div>
            ))}
          </div>

          <button onClick={runResearch} style={primaryBtn}>
            Bestätigen &amp; Preise suchen
          </button>
          <button onClick={reset} style={{
            width: '100%', marginTop: '0.5rem', background: 'transparent', border: 'none',
            color: '#334155', fontSize: '0.65rem', cursor: 'pointer', letterSpacing: '0.06em',
            textTransform: 'uppercase', fontFamily: 'inherit', padding: '0.3rem',
          }}>
            ← Andere Fotos
          </button>
        </>
      )}

      {/* ── Schritt 3: Ergebnis-Karte ── */}
      {phase === 'result' && research && detection && (
        <>
          <div style={{
            background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: '8px',
            padding: '1rem', marginBottom: '0.75rem',
          }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e0f2fe', marginBottom: '0.15rem' }}>
              {[detection.brand, detection.model].filter(Boolean).join(' ') || 'Uhr'}
            </div>
            {detection.reference && (
              <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '0.75rem' }}>
                Ref. {detection.reference}{detection.year ? ` · ${detection.year}` : ''}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Median</span>
              <span style={{ fontSize: '1.6rem', fontWeight: 700, color: ACCENT, letterSpacing: '0.02em' }}>
                {eur(research.soldMedian)}
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
              Spanne {eur(research.soldMin)} – {eur(research.soldMax)} · {research.sampleCount} Verkäufe
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '0.58rem', color: '#64748b', background: '#0a1424',
                border: `1px solid ${BORDER}`, borderRadius: '4px', padding: '0.2rem 0.45rem',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                Quelle: {research.source}
              </span>
              {research.confidence === 'unsicher' && (
                <span style={{
                  fontSize: '0.58rem', color: '#eab308', background: 'rgba(234,179,8,0.08)',
                  border: '1px solid rgba(234,179,8,0.3)', borderRadius: '4px',
                  padding: '0.2rem 0.45rem', textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  ⚠ unsicher
                </span>
              )}
            </div>

            {research.note && (
              <div style={{ fontSize: '0.68rem', color: '#eab308', marginTop: '0.5rem' }}>
                {research.note}
              </div>
            )}
          </div>

          {research.samples.length > 0 && (
            <>
              <span style={labelStyle}>Beleg-Verkäufe</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.75rem' }}>
                {research.samples.map((s, i) => {
                  const inner = (
                    <>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {s.title || 'Verkauf'}{s.date ? ` · ${s.date}` : ''}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e0f2fe', flexShrink: 0 }}>
                        {eur(s.price)}
                      </span>
                    </>
                  )
                  const box: React.CSSProperties = {
                    display: 'flex', gap: '0.5rem', alignItems: 'center',
                    background: CARD_BG, border: `1px solid ${BORDER}`,
                    borderRadius: '5px', padding: '0.45rem 0.65rem', textDecoration: 'none',
                  }
                  return s.url ? (
                    <a key={i} href={s.url} target="_blank" rel="noreferrer" style={box}>{inner}</a>
                  ) : (
                    <div key={i} style={box}>{inner}</div>
                  )
                })}
              </div>
            </>
          )}

          <button onClick={applyValues} disabled={applied} style={{
            ...primaryBtn,
            opacity: applied ? 0.6 : 1,
            background: applied ? 'transparent' : 'rgba(6,182,212,0.08)',
          }}>
            {applied ? '✓ Werte übernommen' : 'Werte in Artikel übernehmen'}
          </button>
          <button onClick={reset} style={{
            width: '100%', marginTop: '0.5rem', background: 'transparent', border: 'none',
            color: '#334155', fontSize: '0.65rem', cursor: 'pointer', letterSpacing: '0.06em',
            textTransform: 'uppercase', fontFamily: 'inherit', padding: '0.3rem',
          }}>
            Neue Erkennung →
          </button>
        </>
      )}
    </div>
  )
}
