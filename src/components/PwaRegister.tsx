'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker apenas em produção: em desenvolvimento o cache
 * atrapalharia o hot reload. Para testar o modo offline, use
 * `npm run build && npm start`.
 */
export default function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    };

    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
