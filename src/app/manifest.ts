import type { MetadataRoute } from 'next';

// necessário para `output: 'export'`
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Snake Rush',
    short_name: 'Snake Rush',
    description:
      'Snake Rush em Canvas: turbo, habilidade de 2 s com auto-corte, pausa e efeitos sonoros sintetizados.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0f27',
    theme_color: '#0a0f27',
    lang: 'pt-BR',
    categories: ['games', 'entertainment'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
