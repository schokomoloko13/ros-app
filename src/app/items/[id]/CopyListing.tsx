'use client';

import { useState } from 'react';

type Props = {
  title: string;
  description: string;
  price: number | string | null;
};

export default function CopyListing({ title, description, price }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const priceNumber =
    price === null || price === undefined || price === '' ? NaN : Number(price);
  const hasPrice = !isNaN(priceNumber);
  const priceClipboard = hasPrice ? String(priceNumber) : '';
  const priceDisplay = hasPrice
    ? priceNumber.toLocaleString('de-DE') + ' €'
    : '';

  const parts: string[] = [];
  if (title) parts.push(title);
  if (description) parts.push(description);
  if (priceDisplay) parts.push(`Preis: ${priceDisplay}`);
  const allText = parts.join('\n\n');

  async function copy(key: string, text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(key);
    window.setTimeout(() => setCopied(null), 2000);
  }

  const rows = [
    {
      key: 'title',
      label: 'TITEL',
      text: title,
      preview: title || '—',
      count: `${title.length}/65`,
      over: title.length > 65,
    },
    {
      key: 'description',
      label: 'TEXT',
      text: description,
      preview: description
        ? description.length > 70
          ? description.slice(0, 70) + '…'
          : description
        : '—',
      count: `${description.length}/4000`,
      over: description.length > 4000,
    },
    {
      key: 'price',
      label: 'PREIS',
      text: priceClipboard,
      preview: priceDisplay || '—',
      count: '',
      over: false,
    },
  ];

  return (
    <div
      style={{
        border: '1px solid rgba(6,182,212,0.35)',
        background: 'rgba(6,182,212,0.05)',
        borderRadius: 12,
        padding: 20,
        marginTop: 24,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <div
          style={{
            color: '#06b6d4',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 2,
          }}
        >
          📋 LISTING KOPIEREN
        </div>
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
          für Kleinanzeigen & Vinted
        </div>
      </div>

      {rows.map((row) => (
        <div
          key={row.key}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 0',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ width: 70, flexShrink: 0 }}>
            <div
              style={{
                color: 'rgba(255,255,255,0.85)',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 1,
              }}
            >
              {row.label}
            </div>
            {row.count && (
              <div
                style={{
                  color: row.over ? '#f59e0b' : 'rgba(255,255,255,0.3)',
                  fontSize: 10,
                  marginTop: 2,
                }}
              >
                {row.count}
              </div>
            )}
          </div>
          <div
            style={{
              flex: 1,
              color: 'rgba(255,255,255,0.5)',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {row.preview}
          </div>
          <button
            onClick={() => copy(row.key, row.text)}
            disabled={!row.text}
            style={{
              flexShrink: 0,
              padding: '6px 14px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              borderRadius: 8,
              border:
                copied === row.key
                  ? '1px solid #22c55e'
                  : '1px solid rgba(6,182,212,0.5)',
              background:
                copied === row.key ? 'rgba(34,197,94,0.15)' : 'transparent',
              color: copied === row.key ? '#22c55e' : '#06b6d4',
              cursor: row.text ? 'pointer' : 'not-allowed',
              opacity: row.text ? 1 : 0.35,
            }}
          >
            {copied === row.key ? '✓ KOPIERT' : 'KOPIEREN'}
          </button>
        </div>
      ))}

      <button
        onClick={() => copy('all', allText)}
        disabled={!allText}
        style={{
          marginTop: 14,
          width: '100%',
          padding: '10px 0',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 2,
          borderRadius: 8,
          border:
            copied === 'all'
              ? '1px solid #22c55e'
              : '1px solid rgba(6,182,212,0.6)',
          background:
            copied === 'all' ? 'rgba(34,197,94,0.15)' : 'rgba(6,182,212,0.12)',
          color: copied === 'all' ? '#22c55e' : '#06b6d4',
          cursor: allText ? 'pointer' : 'not-allowed',
          opacity: allText ? 1 : 0.35,
        }}
      >
        {copied === 'all'
          ? '✓ ALLES KOPIERT'
          : '⧉ ALLES KOPIEREN (Titel + Text + Preis)'}
      </button>
    </div>
  );
}
