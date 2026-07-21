'use client';

import Link from 'next/link';
import { useState } from 'react';

type Img = { id: string; url: string };

type Props = {
  itemId: string;
  title: string;
  description: string;
  price: number | null;
  images: Img[];
};

type ShareState = 'idle' | 'busy' | 'ok' | 'fallback';
type CopyState = 'idle' | 'ok' | 'error';
type MarkState = 'idle' | 'busy' | 'ok' | 'error';
type Platform = 'kleinanzeigen' | 'vinted';

const PLATFORM_URL: Record<Platform, string> = {
  kleinanzeigen: 'https://www.kleinanzeigen.de',
  vinted: 'https://www.vinted.de/items/new',
};

// Große, klar getrennte Blöcke — auf dem Handy zählt Daumenreichweite,
// nicht Informationsdichte.
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.9rem' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
          background: 'rgba(6,182,212,0.15)', color: '#06b6d4',
          fontSize: '0.8rem', fontWeight: 700,
        }}>{n}</span>
        <h2 style={{ margin: 0, fontSize: '0.8rem', letterSpacing: '0.08em' }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

const bigButton = (accent: string, disabled = false): React.CSSProperties => ({
  width: '100%',
  minHeight: '52px',
  padding: '0.9rem 1rem',
  fontSize: '0.85rem',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  borderRadius: '8px',
  border: `1px solid ${accent}99`,
  background: `${accent}1f`,
  color: accent,
  fontFamily: 'inherit',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.45 : 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none',
});

const noteStyle: React.CSSProperties = {
  fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.6, marginTop: '0.7rem',
};

export default function PostFlow({ itemId, title, description, price, images }: Props) {
  const [share, setShare] = useState<ShareState>('idle');
  const [shareMsg, setShareMsg] = useState('');
  const [copy, setCopy] = useState<CopyState>('idle');
  const [marks, setMarks] = useState<Record<Platform, MarkState>>({ kleinanzeigen: 'idle', vinted: 'idle' });
  const [markMsg, setMarkMsg] = useState('');

  const adText = [title, '', description, price != null ? `\nPreis: ${Number(price).toFixed(0)} €` : '']
    .join('\n')
    .trim();

  // Schritt 1 — Bilder ins Teilen-Sheet geben.
  async function shareImages() {
    if (!images.length) return;
    setShare('busy');
    setShareMsg('');
    try {
      const files: File[] = [];
      for (let i = 0; i < images.length; i++) {
        const res = await fetch(images[i].url);
        if (!res.ok) throw new Error(`Bild ${i + 1} nicht ladbar (HTTP ${res.status})`);
        const blob = await res.blob();
        const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        files.push(new File([blob], `foto-${i + 1}.${ext}`, { type: blob.type || 'image/jpeg' }));
      }

      // canShare muss VOR share() geprüft werden — sonst wirft iOS erst im
      // Sheet und der Nutzer sieht nur einen Abbruch ohne Erklärung.
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
        await navigator.share({ files, title: title || 'Fotos' });
        setShare('ok');
        setShareMsg('Im Teilen-Menü „Bilder sichern" wählen — danach liegen sie in der Galerie.');
      } else {
        setShare('fallback');
        setShareMsg('Dieses Gerät kann Dateien nicht teilen — Bilder unten lange gedrückt halten.');
      }
    } catch (e: any) {
      // Abbruch im Sheet ist kein Fehler, sondern ein Nein.
      if (e?.name === 'AbortError') {
        setShare('idle');
        return;
      }
      setShare('fallback');
      setShareMsg(String(e?.message || e));
    }
  }

  // Schritt 2 — Anzeigentext in die Zwischenablage.
  async function copyText() {
    try {
      await navigator.clipboard.writeText(adText);
      setCopy('ok');
    } catch {
      setCopy('error');
    }
  }

  // Schritt 4 — Buchführung, damit die Matrix auch bei Handy-Posts stimmt.
  async function markListed(platform: Platform) {
    setMarks(m => ({ ...m, [platform]: 'busy' }));
    setMarkMsg('');
    try {
      const res = await fetch(`/api/items/${itemId}/listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMarks(m => ({ ...m, [platform]: 'ok' }));
    } catch (e: any) {
      setMarks(m => ({ ...m, [platform]: 'error' }));
      setMarkMsg(String(e?.message || e));
    }
  }

  const showGallery = share === 'fallback';
  const anyMarked = marks.kleinanzeigen === 'ok' || marks.vinted === 'ok';

  return (
    <div>
      <Step n={1} title="BILDER IN GALERIE SICHERN">
        <button
          onClick={shareImages}
          disabled={!images.length || share === 'busy'}
          style={bigButton('#06b6d4', !images.length || share === 'busy')}
        >
          {share === 'busy' ? '⏳ BILDER WERDEN GELADEN…' : `📸 ${images.length} BILDER TEILEN`}
        </button>
        {!images.length && <div style={noteStyle}>Dieser Artikel hat noch keine Fotos.</div>}
        {shareMsg && (
          <div style={{ ...noteStyle, color: share === 'ok' ? '#22c55e' : '#f59e0b' }}>{shareMsg}</div>
        )}

        {showGallery && images.length > 0 && (
          <>
            <div style={{ ...noteStyle, color: '#f59e0b' }}>
              Bild gedrückt halten → „Zu Fotos hinzufügen".
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '0.5rem', marginTop: '0.7rem',
            }}>
              {images.map(img => (
                <img
                  key={img.id}
                  src={img.url}
                  alt=""
                  style={{
                    width: '100%', aspectRatio: '1', objectFit: 'cover',
                    borderRadius: '6px', border: '1px solid #1e293b', display: 'block',
                  }}
                />
              ))}
            </div>
          </>
        )}
      </Step>

      <Step n={2} title="ANZEIGENTEXT KOPIEREN">
        <button onClick={copyText} style={bigButton(copy === 'ok' ? '#22c55e' : '#06b6d4')}>
          {copy === 'ok' ? '✓ KOPIERT' : '📋 TEXT KOPIEREN'}
        </button>
        {copy === 'error' && (
          <div style={{ ...noteStyle, color: '#f97316' }}>
            Zwischenablage blockiert — Text unten markieren und manuell kopieren.
          </div>
        )}
        <div style={{
          marginTop: '0.7rem', padding: '0.75rem', borderRadius: '6px',
          background: '#050a14', border: '1px solid #1e293b',
          fontSize: '0.7rem', color: '#94a3b8', lineHeight: 1.6,
          whiteSpace: 'pre-wrap', maxHeight: '160px', overflowY: 'auto',
        }}>
          {adText || 'Noch kein KI-Text vorhanden.'}
        </div>
      </Step>

      <Step n={3} title="PLATTFORM ÖFFNEN">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <a href={PLATFORM_URL.kleinanzeigen} target="_blank" rel="noreferrer" style={bigButton('#06b6d4')}>
            🚀 KLEINANZEIGEN ÖFFNEN
          </a>
          <a href={PLATFORM_URL.vinted} target="_blank" rel="noreferrer" style={bigButton('#c084fc')}>
            🚀 VINTED ÖFFNEN
          </a>
        </div>
        <div style={noteStyle}>
          Ist die App installiert, öffnet sie sich automatisch. Dort die Fotos aus
          der Galerie wählen und den Text einfügen.
        </div>
      </Step>

      <Step n={4} title="ALS GELISTET MARKIEREN">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {(['kleinanzeigen', 'vinted'] as const).map(p => {
            const st = marks[p];
            const accent = p === 'kleinanzeigen' ? '#06b6d4' : '#c084fc';
            const short = p === 'kleinanzeigen' ? 'KA' : 'VINTED';
            return (
              <button
                key={p}
                onClick={() => markListed(p)}
                disabled={st === 'busy'}
                style={bigButton(st === 'ok' ? '#22c55e' : accent, st === 'busy')}
              >
                {st === 'busy'
                  ? '⏳ WIRD EINGETRAGEN…'
                  : st === 'ok'
                    ? `✓ ${short} EINGETRAGEN`
                    : `✓ AUF ${short} GELISTET`}
              </button>
            );
          })}
        </div>
        {markMsg && <div style={{ ...noteStyle, color: '#f97316' }}>{markMsg}</div>}
        {anyMarked && (
          <div style={{ ...noteStyle, color: '#22c55e' }}>
            Eingetragen — sichtbar in{' '}
            <Link href="/matrix" style={{ color: '#22c55e', textDecoration: 'underline' }}>der Matrix</Link>
            {' '}und auf{' '}
            <Link href={`/items/${itemId}`} style={{ color: '#22c55e', textDecoration: 'underline' }}>der Artikelseite</Link>.
          </div>
        )}
      </Step>
    </div>
  );
}
