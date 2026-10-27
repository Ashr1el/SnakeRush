import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jogo da Cobrinha',
  description:
    'Jogo da cobrinha em React e Next.js: movimento suave no canvas, turbo, pausa e efeitos sonoros sintetizados.',
  applicationName: 'Jogo da Cobrinha',
};

export const viewport: Viewport = {
  themeColor: '#0a0f27',
  initialScale: 1,
  width: 'device-width',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
