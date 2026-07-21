import { JetBrains_Mono } from 'next/font/google'
import './globals.css'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains',
})

export const metadata = {
  title: 'R.O.S. | Resale Operating System',
  description: 'Jarvis-style command center',
}

// Explizit gesetzt, damit die Media Queries auf dem Handy greifen und iOS
// nicht auf eine 980px-Desktopbreite herauszoomt.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={jetbrainsMono.variable}>
      <body className={jetbrainsMono.className}>{children}</body>
    </html>
  )
}
