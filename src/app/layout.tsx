import { JetBrains_Mono } from 'next/font/google'
import './globals.css'
import NavBar from '../components/NavBar'
import JarvisBriefing from '../components/JarvisBriefing'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains',
})

export const metadata = {
  title: 'R.O.S. | Resale Operating System',
  description: 'Jarvis-style command center',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={jetbrainsMono.variable}>
      <body className={jetbrainsMono.className}>
        <NavBar />
        {children}
        <JarvisBriefing />
      </body>
    </html>
  )
}
