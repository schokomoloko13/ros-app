'use client'

import { useState, useRef } from 'react'
import { updateImageOrder, deleteImage, setPrimaryImage } from './actions'

type ImageRow = {
  id: string
  url: string
  storage_path: string
  is_primary: boolean
  is_ai_generated: boolean
  sort_order: number
}

export default function ImageGallery({ initialImages, itemId }: { initialImages: ImageRow[]; itemId: string }) {
  const [images, setImages] = useState(initialImages)
  const [modal, setModal] = useState<string | null>(null)
  const dragIdx = useRef<number | null>(null)

  const handleDragStart = (idx: number) => {
    dragIdx.current = idx
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === idx) return
    const next = [...images]
    const [moved] = next.splice(dragIdx.current, 1)
    next.splice(idx, 0, moved)
    dragIdx.current = idx
    setImages(next)
  }

  const handleDrop = async () => {
    dragIdx.current = null
    await updateImageOrder(itemId, images.map(i => i.id))
  }

  const handleDelete = async (img: ImageRow) => {
    if (!window.confirm('Foto löschen?')) return
    const result = await deleteImage(img.id, img.storage_path)
    if (result.ok) setImages(prev => prev.filter(i => i.id !== img.id))
  }

  const handleSetPrimary = async (img: ImageRow) => {
    const result = await setPrimaryImage(itemId, img.id)
    if (result.ok) setImages(prev => prev.map(i => ({ ...i, is_primary: i.id === img.id })))
  }

  if (images.length === 0) {
    return (
      <div className="panel" style={{ padding: '3rem', textAlign: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📷</div>
        <div style={{ fontSize: '0.75rem', color: '#475569' }}>Keine Fotos vorhanden</div>
      </div>
    )
  }

  return (
    <>
      <div className="panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.6rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem' }}>
          FOTOS · Ziehen zum Sortieren · Klick zum Vergrößern
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: images.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '0.5rem',
        }}>
          {images.map((img, idx) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDrop={handleDrop}
              style={{
                position: 'relative',
                aspectRatio: '1',
                borderRadius: '6px',
                overflow: 'hidden',
                border: img.is_primary ? '2px solid #06b6d4' : '1px solid #1e293b',
                cursor: 'grab',
                userSelect: 'none',
              }}
            >
              <img
                src={img.url}
                alt=""
                onClick={() => setModal(img.url)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
                loading="lazy"
                draggable={false}
              />

              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0,
                display: 'flex', justifyContent: 'space-between', padding: '4px',
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.65), transparent)',
              }}>
                {!img.is_primary ? (
                  <button
                    onClick={e => { e.stopPropagation(); handleSetPrimary(img) }}
                    title="Als Titelbild setzen"
                    style={{
                      background: 'rgba(6,182,212,0.85)', border: 'none', borderRadius: '3px',
                      color: '#000', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.04em',
                      padding: '0.15rem 0.35rem', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    ★
                  </button>
                ) : <div />}
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(img) }}
                  title="Foto löschen"
                  style={{
                    background: 'rgba(239,68,68,0.85)', border: 'none', borderRadius: '3px',
                    color: '#fff', fontSize: '0.75rem', fontWeight: 700,
                    padding: '0.1rem 0.35rem', cursor: 'pointer', lineHeight: 1, fontFamily: 'inherit',
                  }}
                >
                  ✕
                </button>
              </div>

              {img.is_primary && (
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'rgba(6,182,212,0.85)', fontSize: '0.55rem', color: '#000',
                  fontWeight: 700, letterSpacing: '0.1em', textAlign: 'center', padding: '0.2rem',
                }}>
                  TITELBILD
                </div>
              )}
              {img.is_ai_generated && (
                <div style={{
                  position: 'absolute', top: '6px', right: '34px',
                  background: 'rgba(168,85,247,0.85)', fontSize: '0.5rem', color: '#fff',
                  fontWeight: 700, letterSpacing: '0.08em', padding: '0.15rem 0.4rem', borderRadius: '3px',
                }}>
                  AI
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {modal && (
        <div
          onClick={() => setModal(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={modal}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }}
          />
        </div>
      )}
    </>
  )
}
