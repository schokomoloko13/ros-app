'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Globale Navigation — liegt über jeder Seite (eingebunden in app/layout.tsx).
// Einzige Ausnahme: /schaufenster (Kundenansicht) bleibt bewusst nackt.
// Mobil: eine einzige waagerechte, wischbare Reihe.
const LINKS = [
  { href: '/', label: 'CENTER' },
  { href: '/inventory', label: 'INVENTORY' },
  { href: '/finanzen', label: 'FINANZEN' },
  { href: '/tempo', label: 'TEMPO' },
  { href: '/matrix', label: 'MATRIX' },
  { href: '/capture', label: '+ NEU' },
]

export default function NavBar() {
  const path = usePathname() || '/'
  if (path.startsWith('/schaufenster')) return null

  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href))

  return (
    <nav className="ros-nav">
      <Link href="/" className="ros-nav-brand">⌁ R.O.S.</Link>
      <div className="ros-nav-links">
        {LINKS.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={
              'ros-nav-link'
              + (isActive(l.href) ? ' active' : '')
              + (l.href === '/capture' ? ' ros-nav-cta' : '')
            }
          >
            {l.label}
          </Link>
        ))}
        <a
          href="/schaufenster"
          target="_blank"
          rel="noopener noreferrer"
          className="ros-nav-link ros-nav-sf"
        >
          🪟 SCHaufenster ↗
        </a>
      </div>
    </nav>
  )
}
