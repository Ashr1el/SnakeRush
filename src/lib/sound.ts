// Efeitos sonoros com Web Audio API (sem arquivos de áudio externos)
type ToneOpts = {
  from: number;
  to?: number;
  dur: number;
  type?: OscillatorType;
  start?: number;
  volume?: number;
};

const MUTED_KEY = 'snakeMuted';

let audioCtx: AudioContext | null = null;

let muted = false;
try {
  if (typeof localStorage !== 'undefined') muted = localStorage.getItem(MUTED_KEY) === '1';
} catch {
  /* storage indisponível (SSR, modo restrito) */
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined' || muted) return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) {
    try {
      audioCtx = new AC();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') void audioCtx.resume().catch(() => undefined);
  return audioCtx;
}

function tone({ from, to, dur, type = 'square', start = 0, volume = 0.12 }: ToneOpts) {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to && to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t0 + dur);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

export const sfx = {
  /** comeu a fruta: blip ascendente alegre */
  eat() {
    tone({ from: 660, to: 1046, dur: 0.11, type: 'square', volume: 0.1 });
    tone({ from: 990, to: 1568, dur: 0.1, type: 'triangle', start: 0.06, volume: 0.07 });
  },
  /** bateu: queda grave */
  die() {
    tone({ from: 340, to: 70, dur: 0.55, type: 'sawtooth', volume: 0.12 });
    tone({ from: 190, to: 50, dur: 0.5, type: 'square', start: 0.05, volume: 0.06 });
  },
  /** iniciar, resetar ou resumir: arpejo curto */
  start() {
    tone({ from: 523, dur: 0.09, type: 'triangle', volume: 0.11 });
    tone({ from: 659, dur: 0.09, type: 'triangle', start: 0.08, volume: 0.11 });
    tone({ from: 784, dur: 0.14, type: 'triangle', start: 0.16, volume: 0.11 });
  },
  /** pausar: descida suave */
  pause() {
    tone({ from: 620, to: 300, dur: 0.18, type: 'triangle', volume: 0.1 });
  },
  /** clique de botão */
  click() {
    tone({ from: 880, dur: 0.05, type: 'square', volume: 0.07 });
  },
  isMuted() {
    return muted;
  },
  setMuted(v: boolean) {
    muted = v;
    try {
      localStorage.setItem(MUTED_KEY, v ? '1' : '0');
    } catch {
      /* storage indisponível */
    }
  },
  toggleMuted() {
    this.setMuted(!muted);
    return muted;
  },
};
