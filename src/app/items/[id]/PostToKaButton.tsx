'use client';

import { useRef, useState } from 'react';

const KA_URL = 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html';

type Props = {
  itemId: string;
  hasListing: boolean;
};

type State = 'idle' | 'sending' | 'ok' | 'error';

export default function PostToKaButton({ itemId, hasListing }: Props) {
  const [state, setState] = useState<State>('idle');
  const [hint, setHint] = useState('');
  const answered = useRef(false);

  function post() {
    if (!hasListing || state === 'sending') return;
    setState('sending');
    setHint('');
    answered.current = false;

    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.type !== 'ROS_ACK') return;
      window.removeEventListener('message', onMsg);
      answered.current = true;
      if (d.ok) {
        setState('ok');
        const w = window.open(KA_URL, '_blank');
        if (w) {
          setHint('Gestartet — der neue Tab wird jetzt automatisch ausgefüllt.');
        } else {
          setHint('Job gespeichert, aber der Tab wurde blockiert. Bitte die Inserieren-Seite manuell öffnen — das Ausfüllen startet von allein.');
        }
      } else {
        setState('error');
        setHint(d.error || 'Fehler beim Starten des Jobs.');
      }
    };

    window.addEventListener('message', onMsg);
    window.postMessage({ type: 'ROS_POST_TO_KA', itemId }, '*');

    window.setTimeout(() => {
      window.removeEventListener('message', onMsg);
      if (!answered.current) {
        setState('error');
        setHint('Extension antwortet nicht. Prüfe chrome://extensions (Rundpfeil zum Neu laden) und versuche es erneut.');
      }
    }, 4000);
  }

  const disabled = !hasListing || state === 'sending';

  return (
    <div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
        CROSS-POSTING <span style={{ color: '#1e293b' }}>//</span>{' '}
        <span style={{ color: '#475569' }}>PLATTFORMEN</span>
      </h2>

      <button
        onClick={post}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '0.85rem 1rem',
          fontSize: '0.8rem',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          borderRadius: '6px',
          border: '1px solid rgba(6,182,212,0.6)',
          background: state === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(6,182,212,0.12)',
          color: state === 'ok' ? '#22c55e' : '#06b6d4',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.4 : 1,
        }}
      >
        {state === 'sending'
          ? '⏳ WIRD GESTARTET…'
          : state === 'ok'
            ? '✓ GESTARTET — NOCHMAL POSTEN'
            : '📤 AUF KLEINANZEIGEN POSTEN'}
      </button>

      {!hasListing && (
        <div style={{ fontSize: '0.65rem', color: '#f59e0b', marginTop: '0.6rem', lineHeight: 1.5 }}>
          Erst KI-Text generieren — ohne Titel kann die Extension nichts ausfüllen.
        </div>
      )}
      {hint && (
        <div
          style={{
            fontSize: '0.65rem',
            color: state === 'error' ? '#f97316' : '#94a3b8',
            marginTop: '0.6rem',
            lineHeight: 1.6,
          }}
        >
          {hint}
        </div>
      )}
      <div style={{ fontSize: '0.6rem', color: '#475569', marginTop: '0.6rem', textAlign: 'center' }}>
        Extension füllt das KA-Formular automatisch aus
      </div>
    </div>
  );
}
