import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Brandable domain name generator',
  description: 'Generate and check availability of readable, brandable domain names using phonetic patterns.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="favicon.png"></link>
      </head>
      <body>{children}</body>
    </html>
  )
}
