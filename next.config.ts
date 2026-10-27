import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Build 100% estático em `out/` — necessário para empacotar com Capacitor (E4).
  // Consequência: `next start` deixa de servir o app; use `npx serve out`.
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
