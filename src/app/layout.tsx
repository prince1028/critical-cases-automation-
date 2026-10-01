import type { Metadata, Viewport } from 'next';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Florzy Critical Cases', template: '%s · Florzy Critical Cases' },
  description: 'Report and track critical supply cases at Florzy.',
  // Tab/bookmark icons come from app/favicon.ico, app/icon.png and app/apple-icon.png (Next adds the <link> tags).
  // Absolute base for the link-preview image. Fixed to production: pages prerendered at build time would otherwise get localhost.
  metadataBase: new URL('https://cases.florzy.workers.dev'),
  applicationName: 'Florzy Critical Cases',
  openGraph: {
    siteName: 'Florzy Critical Cases',
    title: 'Florzy Critical Cases',
    description: 'Report and track critical supply cases at Florzy.',
    images: [{ url: '/florzy-logo.png', width: 200, height: 200, alt: 'Florzy' }],
  },
  twitter: { card: 'summary', images: ['/florzy-logo.png'] },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#FF4500' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
