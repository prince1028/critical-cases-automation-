import type { Metadata, Viewport } from 'next';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Florzy Critical Cases', template: '%s · Florzy Critical Cases' },
  description: 'Report and track critical supply cases at Florzy.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

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
