/**
 * Feedback tátil curto.
 * - App nativo (Capacitor): plugin @capacitor/haptics, carregado sob demanda.
 * - Navegador: `navigator.vibrate` quando disponível (Android/Chrome).
 * - iOS Safari não expõe a API: fica silencioso, sem erro.
 */
export type HapticStyle = 'light' | 'medium';

export async function haptic(style: HapticStyle = 'light'): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({
        style: style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light,
      });
      return;
    }
  } catch {
    /* plugin indisponível neste ambiente: usa o fallback web */
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(style === 'medium' ? 40 : 15);
    }
  } catch {
    /* sem suporte — silencioso */
  }
}
