import type { Metadata, Viewport } from 'next';
import { sora, inter, jetbrainsMono } from './fonts';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Khwaishein',
    template: '%s · Khwaishein',
  },
  description: 'Enterprise Lead Management CRM — Sort String Solutions LLP',
  applicationName: 'Khwaishein',
  // Browser tab / bookmark icon. Points at the same file the sidebar and login
  // use, so there is one brand asset to replace rather than three.
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      // Suppress a benign warning: `Providers` toggles `body.dark` on mount,
      // which momentarily disagrees with the server-rendered `<html>` attrs.
      suppressHydrationWarning
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
