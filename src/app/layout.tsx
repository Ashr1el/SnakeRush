import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import PwaRegister from '@/components/PwaRegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'Snake Rush',
  description:
    'Snake Rush em React e Next.js: movimento suave no canvas, turbo, pausa e efeitos sonoros sintetizados.',
  applicationName: 'Snake Rush',
  appleWebApp: {
    capable: true,
    title: 'Snake Rush',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0a0f27',
  initialScale: 1,
  width: 'device-width',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
