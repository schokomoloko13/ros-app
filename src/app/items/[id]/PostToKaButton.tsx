'use client';

import { useRef, useState } from 'react';

const URLS = {
  ka: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html',
  vinted: 'https://www.vinted.de/items/new',
};

const MESSAGES = {
  ka: 'ROS_POST_TO_KA',
  vinted: 'ROS_POST_TO_VINTED',
};

type Platform = 'ka' | 'vinted';
type State = 'idle' | 'sending' | 'ok' | 'error';

type Props = {
  itemId: string;
  hasListing: boolean;
};

export default function PostToKaButton({ itemId, hasListing }: Props) {
  const [states, setStates] = useState<Record<Platform, State>>({ ka: 'idle', vinted: 'idle' });
  const [hint, setHint] = useState('');
  const answered = useRef(false);

  function post(platform: Platform) {
    if (!hasListing || states[platform] === 'sending') return;
    setStates(s => ({ ...s, [platform]: 'sending' }));
    setHint('');
    answered.current = false;

    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.type !== 'ROS_ACK') return;
      window.removeEventListener('message', onMsg);
      answered.current = true;
      if (d.ok) {
        setStates(s => ({ ...s, [platform]: 'ok' }));
        const w = window.open(URLS[platform], '_blank');
        if (w) {
          setHint('Gestartet — der neue Tab wird jetzt automatisch ausgefüllt.');
        } else {
          setHint('Job gespeichert, aber der Tab wurde blockiert. Bitte die Seite manuell öffnen — das Ausfüllen startet von allein.');
        }
      } else {
        setStates(s => ({ ...s, [platform]: 'error' }));
        setHint(d.error || 'Fehler beim Starten des Jobs.');
      }
    };

    window.addEventListener('message', onMsg);
    window.postMessage({ type: MESSAGES[platform], itemId }, '*');

    window.setTimeout(() => {
      window.removeEventListener('message', onMsg);
      if (!answered.current) {
        setStates(s => ({ ...s, [platform]: 'error' }));
        setHint('Extension antwortet nicht. Prüfe chrome://extensions (Rundpfeil zum Neu laden) und versuche es erneut.');
      }
    }, 4000);
  }

  function renderButton(platform: Platform, label: string, accent: string) {
    const state = states[platform];
    const disabled = !hasListing || state === 'sending';
    return (
      <button
        onClick={() => post(platform)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '0.85rem 1rem',
          fontSize: '0.8rem',
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          borderRadius: '6px',
          border: `1px solid ${accent}99`,
          background: state === 'ok' ? 'rgba(34,197,94,0.12)' : `${accent}1f`,
          color: state === 'ok' ? '#22c55e' : accent,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.4 : 1,
        }}
      >
        {state === 'sending'
          ? '⏳ WIRD GESTARTET…'
          : state === 'ok'
            ? '✓ GESTARTET — NOCHMAL'
            : label}
      </button>
    );
  }

  return (
    <div className="panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '0.85rem', letterSpacing: '0.08em' }}>
        CROSS-POSTING <span style={{ color: '#1e293b' }}>//</span>{' '}
        <span style={{ color: '#475569' }}>PLATTFORMEN</span>
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {renderButton('ka', '📤 AUF KLEINANZEIGEN POSTEN', '#06b6d4')}
        {renderButton('vinted', '📤 AUF VINTED POSTEN', '#c084fc')}
      </div>

      {!hasListing && (
        <div style={{ fontSize: '0.65rem', color: '#f59e0b', marginTop: '0.6rem', lineHeight: 1.5 }}>
          Erst KI-Text generieren — ohne Titel kann die Extension nichts ausfüllen.
        </div>
      )}
      {hint && (
        <div
          style={{
            fontSize: '0.65rem',
            color: Object.values(states).includes('error') ? '#f97316' : '#94a3b8',
            marginTop: '0.6rem',
            lineHeight: 1.6,
          }}
        >
          {hint}
        </div>
      )}
      <div style={{ fontSize: '0.6rem', color: '#475569', marginTop: '0.6rem', textAlign: 'center' }}>
        Extension füllt das Formular automatisch aus
      </div>
    </div>
  );
}
