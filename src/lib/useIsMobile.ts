'use client';

import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT = 768;

/**
 * Erkennt Handys für Flows, die es dort anders geben muss (z. B. Post-Flow
 * statt Chrome-Extension). Startet bewusst mit `false`: beim ersten Render
 * gibt es kein window, und ein Server-Render, der "mobil" rät, würde beim
 * Hydrieren springen. Erst der Effect entscheidet.
 *
 * Geprüft wird Viewport ODER User-Agent — ein iPad im Querformat ist breit,
 * hat aber trotzdem keine Extension.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const narrow = window.innerWidth <= MOBILE_BREAKPOINT;
      const touchUA = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent);
      setIsMobile(narrow || touchUA);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}
