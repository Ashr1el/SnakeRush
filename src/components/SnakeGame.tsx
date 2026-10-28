'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import {
  ABILITY_THRESHOLD,
  CELL,
  COLS,
  DIRS,
  H,
  ROWS,
  W,
  abilityPips as computeAbilityPips,
  advanceAbility,
  createGame,
  step,
  stepInterval,
  type Dir,
  type Food,
  type FoodKind,
  type Game,
} from '@/game/engine';
import { sfx } from '@/lib/sound';
import { haptic } from '@/lib/haptics';

type Status = 'idle' | 'running' | 'paused' | 'over';

const BEST_KEY = 'snakeBest';

const KEY_MAP: Record<string, Dir> = {
  ArrowUp: DIRS.UP,
  ArrowDown: DIRS.DOWN,
  ArrowLeft: DIRS.LEFT,
  ArrowRight: DIRS.RIGHT,
  w: DIRS.UP,
  W: DIRS.UP,
  s: DIRS.DOWN,
  S: DIRS.DOWN,
  a: DIRS.LEFT,
  A: DIRS.LEFT,
  d: DIRS.RIGHT,
  D: DIRS.RIGHT,
};

const BTN_MAP: Record<string, Dir> = {
  up: DIRS.UP,
  down: DIRS.DOWN,
  left: DIRS.LEFT,
  right: DIRS.RIGHT,
};

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  const c = ctx as CanvasRenderingContext2D & {
    roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
  };
  if (typeof c.roundRect === 'function') {
    c.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Padrões de matiz ao longo do corpo, todos dentro do arco-íris.
// A cada bloco laranja coletado o desenho avança para o próximo padrão.
interface HuePattern {
  from: number;
  span: number;
}

const HUE_PATTERNS: HuePattern[] = [
  { from: 160, span: 120 }, // verde -> roxo (padrão inicial)
  { from: 0, span: 360 }, // arco-íris completo, da cabeça para a cauda
  { from: 300, span: -300 }, // arco-íris invertido (cabeça violeta, cauda vermelha)
  { from: 40, span: 200 }, // âmbar -> azul
  { from: 280, span: 200 }, // magenta -> verde
];

const WAVE_MS = 1100; // duração da onda de brilho
const WAVE_BAND = 0.2; // largura da onda no corpo (fração do comprimento)

// Efeitos de fogo: chamas vermelhas no turbo, azuis na habilidade.
const TURBO_FLAME_HUE = 12; // vermelho-alaranjado
const ABILITY_FLAME_HUE = 205; // azul
const ABILITY_BODY_HUE = 210; // durante a habilidade o corpo fica azul (210 → 240)

/** Estado visual fora do modelo do jogo: onda disparada e padrão de cor atual. */
interface DrawFx {
  waveStart: number;
  pattern: number;
}

function hueAt(p: HuePattern, s: number): number {
  return ((p.from + p.span * s) % 360 + 360) % 360;
}


/** Pontos do corpo em px, do índice 0 (cabeça) ao último (cauda), interpolado. */
function bodyPoints(g: Game, t: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < g.snake.length; i++) {
    const seg = g.snake[i];
    const p = g.prev[i] ?? seg;
    pts.push({
      x: (p.x + (seg.x - p.x) * t + 0.5) * CELL,
      y: (p.y + (seg.y - p.y) * t + 0.5) * CELL,
    });
  }
  return pts;
}

function drawEyes(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Dir) {
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const perp: Dir = { x: -dir.y, y: dir.x };
  for (const s of [1, -1]) {
    const ex = cx + dir.x * 3.5 + perp.x * 3.5 * s;
    const ey = cy + dir.y * 3.5 + perp.y * 3.5 * s;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex, ey, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1026';
    ctx.beginPath();
    ctx.arc(ex + dir.x, ey + dir.y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFood(ctx: CanvasRenderingContext2D, food: Food, now: number) {
  const pulse = 1 + Math.sin(now / 180) * 0.1;

  if (food.kind === 'normal') {
    // recurso vermelho: 1 célula, fruta pulsante com brilho
    const c = food.cells[0];
    const fx = c.x * CELL + CELL / 2;
    const fy = c.y * CELL + CELL / 2;
    const fr = (CELL / 2 - 2) * pulse;
    ctx.save();
    ctx.shadowColor = '#ff4d6d';
    ctx.shadowBlur = 18;
    const fg = ctx.createRadialGradient(fx - 3, fy - 3, 1, fx, fy, fr);
    fg.addColorStop(0, '#ffd6e0');
    fg.addColorStop(0.4, '#ff6b8a');
    fg.addColorStop(1, '#e94560');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // recurso laranja: bloco de 2×2 células
  ctx.save();
  ctx.shadowColor = '#fb923c';
  ctx.shadowBlur = 20;
  for (const c of food.cells) {
    const x = c.x * CELL;
    const y = c.y * CELL;
    const gx = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
    gx.addColorStop(0, '#fed7aa');
    gx.addColorStop(0.45, '#fb923c');
    gx.addColorStop(1, '#ea580c');
    ctx.fillStyle = gx;
    roundedRect(ctx, x + 1.5, y + 1.5, CELL - 3, CELL - 3, 5);
    ctx.fill();
  }
  ctx.restore();

  // núcleo pulsante no centro do bloco
  const xs = food.cells.map((c) => c.x);
  const ys = food.cells.map((c) => c.y);
  const cx = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * CELL;
  const cy = ((Math.min(...ys) + Math.max(...ys) + 1) / 2) * CELL;
  ctx.save();
  ctx.globalAlpha = 0.3 + Math.sin(now / 220) * 0.1;
  ctx.fillStyle = '#ffedd5';
  ctx.beginPath();
  ctx.arc(cx, cy, 9 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Aura da chama ao redor do corpo — desenhada antes do corpo, para o degradê
 * da cobra continuar nítido e só o halo aparecer nas bordas.
 * `hue` 12 = turbo (vermelho); `hue` 205 = habilidade (azul).
 */
function drawFlameAura(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  now: number,
  hue: number,
  bodyW: number
) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = bodyW + 8;
  ctx.strokeStyle = `hsla(${hue}, 100%, 55%, 0.32)`;
  ctx.shadowColor = `hsla(${hue}, 100%, 55%, 0.9)`;
  ctx.shadowBlur = 16 + Math.sin(now / 80) * 5;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Línguas de fogo: uma por gomo, saindo da borda em lados alternados, com
 * comprimento e opacidade tremulando a cada quadro.
 */
function drawFlameTongues(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  dir: Dir,
  now: number,
  hue: number,
  bodyW: number
) {
  const n = pts.length;
  if (!n) return;
  const r = bodyW / 2;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < n; i++) {
    const c = pts[i];
    // direção para a frente (em direção à cabeça), normalizada
    let ux: number;
    let uy: number;
    if (n === 1) {
      ux = dir.x;
      uy = dir.y;
    } else if (i > 0) {
      ux = pts[i - 1].x - c.x;
      uy = pts[i - 1].y - c.y;
    } else {
      ux = c.x - pts[1].x;
      uy = c.y - pts[1].y;
    }
    const mag = Math.hypot(ux, uy);
    if (mag < 0.01) continue;
    ux /= mag;
    uy /= mag;

    const side = i % 2 === 0 ? 1 : -1;
    const px = -uy * side;
    const py = ux * side;

    const flick = 0.5 + 0.5 * Math.sin(now / 55 + i * 1.7);
    const reach = r * (0.4 + 0.5 * flick);
    const half = r * 0.55;

    const bx = c.x + px * r * 0.85; // base um pouco dentro do corpo: sem emenda
    const by = c.y + py * r * 0.85;
    const tx = bx + px * reach - ux * reach * 0.45; // ponta levemente tracionada para trás
    const ty = by + py * reach - uy * reach * 0.45;

    const a = 0.5 + 0.5 * flick;
    const grad = ctx.createLinearGradient(bx, by, tx, ty);
    grad.addColorStop(0, `hsla(${hue}, 100%, 80%, ${0.9 * a})`);
    grad.addColorStop(0.55, `hsla(${hue}, 100%, 62%, ${0.6 * a})`);
    grad.addColorStop(1, `hsla(${hue}, 100%, 55%, 0)`);

    const b1x = bx + ux * half;
    const b1y = by + uy * half;
    const b2x = bx - ux * half;
    const b2y = by - uy * half;
    const c1x = (b1x + tx) / 2 + ux * half * 0.6;
    const c1y = (b1y + ty) / 2 + uy * half * 0.6;
    const c2x = (b2x + tx) / 2 + ux * half * 0.6;
    const c2y = (b2y + ty) / 2 + uy * half * 0.6;

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(b1x, b1y);
    ctx.quadraticCurveTo(c1x, c1y, tx, ty);
    ctx.quadraticCurveTo(c2x, c2y, b2x, b2y);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function draw(
  ctx: CanvasRenderingContext2D,
  g: Game,
  t: number,
  now: number,
  fx: DrawFx,
  boost: boolean
) {
  // fundo com gradiente
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#111a3f');
  bg.addColorStop(0.5, '#161247');
  bg.addColorStop(1, '#221449');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // grade sutil
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = 1; x < COLS; x++) {
    for (let y = 1; y < ROWS; y++) {
      ctx.fillRect(x * CELL - 1, y * CELL - 1, 2, 2);
    }
  }

  // comida: vermelha (1 célula) ou laranja (bloco 2×2)
  drawFood(ctx, g.food, now);

  // cobra: um traçado único e contínuo — sem lacunas nem divisão entre os gomos,
  // com cor em degradê ao longo de todo o corpo
  const pts = bodyPoints(g, t);
  const n = pts.length;
  const at = (i: number) => (n > 1 ? i / (n - 1) : 0);
  const bodyW = CELL - 4;
  const pattern = HUE_PATTERNS[fx.pattern % HUE_PATTERNS.length];
  // durante a habilidade o corpo inteiro fica azul; fora dela, o degradê do padrão
  const ability = g.isAbilityActive;
  const bodyHue = (s: number) =>
    ability ? ABILITY_BODY_HUE + 30 * s : hueAt(pattern, s);
  const bodyCss = (s: number, lightness: number) =>
    `hsl(${bodyHue(s).toFixed(1)} 85% ${lightness}%)`;
  // chamas: vermelhas no turbo, azuis na habilidade (a habilidade tem prioridade)
  const onFire = boost || ability;
  const flameHue = ability ? ABILITY_FLAME_HUE : TURBO_FLAME_HUE;

  if (onFire) drawFlameAura(ctx, pts, now, flameHue, bodyW);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = bodyW;

  if (n === 1) {
    ctx.fillStyle = bodyCss(0, 55);
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, bodyW / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // cada trecho ganha um gradiente cujas pontas coincidem com as do vizinho:
    // a junção some e o corpo lê como uma peça só
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      grad.addColorStop(0, bodyCss(at(i), 55 - at(i) * 10));
      grad.addColorStop(1, bodyCss(at(i + 1), 55 - at(i + 1) * 10));
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.restore();

  if (onFire) drawFlameTongues(ctx, pts, g.dir, now, flameHue, bodyW);

  // onda de brilho: ao coletar um recurso laranja uma wave viaja da cabeça
  // até a cauda, deixando o corpo luminoso no rastro
  const waveAge = now - fx.waveStart;
  if (fx.waveStart > 0 && n > 1 && waveAge >= 0 && waveAge < WAVE_MS) {
    const crest = waveAge / WAVE_MS; // 0 na cabeça -> 1 na cauda
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = bodyW;
    for (let i = 0; i < n - 1; i++) {
      const s = (at(i) + at(i + 1)) / 2;
      const d = Math.abs(s - crest);
      if (d >= WAVE_BAND) continue;
      const alpha = (1 - d / WAVE_BAND) ** 2;
      const hue = bodyHue(s);
      ctx.shadowColor = `hsla(${hue}, 100%, 70%, ${alpha})`;
      ctx.shadowBlur = 18 * alpha;
      ctx.strokeStyle = `hsla(${hue}, 100%, 84%, ${alpha * 0.95})`;
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // cabeça: disco levemente maior sobre o corpo, brilho e olhos na direção
  const head = pts[0];
  ctx.save();
  ctx.shadowColor = `hsla(${bodyHue(0).toFixed(1)}, 90%, 60%, 0.85)`;
  ctx.shadowBlur = 16;
  ctx.fillStyle = bodyCss(0, 55);
  ctx.beginPath();
  ctx.arc(head.x, head.y, (CELL - 2) / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawEyes(ctx, head.x - CELL / 2, head.y - CELL / 2, g.dir);

  // flash de morte
  if (g.deathAt) {
    const a = 1 - Math.min(1, (now - g.deathAt) / 600);
    if (a > 0) {
      ctx.fillStyle = `rgba(233, 69, 96, ${a * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

export default function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(createGame());
  const statusRef = useRef<Status>('idle');
  const boostRef = useRef(false);
  const bestRef = useRef(0);
  const chargeRef = useRef(0);
  const redChargeRef = useRef(0);
  const abilityRef = useRef(false);
  const abilityPipsRef = useRef(0);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  // visual da cobra (fora do modelo do jogo): onda de brilho e padrão de cor
  const fxRef = useRef<DrawFx>({ waveStart: -1, pattern: 0 });

  const [status, setStatus] = useState<Status>('idle');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [boost, setBoost] = useState(false);
  const [muted, setMuted] = useState(false);
  const [charge, setCharge] = useState(0);
  const [redCharge, setRedCharge] = useState(0);
  const [ability, setAbility] = useState(false);
  const [abilityPips, setAbilityPips] = useState(0);

  // Hidratação: recorde e mudo vêm do localStorage apenas depois da montagem,
  // para o HTML gerado no servidor bater com o primeiro render do cliente.
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(BEST_KEY) || 0);
      if (Number.isFinite(stored) && stored > 0) {
        bestRef.current = stored;
        setBest(stored);
      }
    } catch {
      /* storage indisponível */
    }
    setMuted(sfx.isMuted());
  }, []);

  const commitBest = useCallback((newScore: number) => {
    if (newScore <= bestRef.current) return;
    bestRef.current = newScore;
    setBest(newScore);
    try {
      localStorage.setItem(BEST_KEY, String(newScore));
    } catch {
      /* storage indisponível */
    }
  }, []);

  const onEat = useCallback(
    (newScore: number, kind: FoodKind) => {
      sfx.eat();
      if (kind === 'special') {
        void haptic('light');
        // recurso laranja: dispara a wave de brilho e troca o padrão de cores
        fxRef.current.waveStart = performance.now();
        fxRef.current.pattern = (fxRef.current.pattern + 1) % HUE_PATTERNS.length;
      }
      setScore(newScore);
      commitBest(newScore);
    },
    [commitBest]
  );

  // auto-corte com bônus: o placar já chega somado do step()
  const onCut = useCallback(
    (newScore: number) => {
      sfx.cut();
      void haptic('medium');
      setScore(newScore);
      commitBest(newScore);
    },
    [commitBest]
  );

  const onAbility = useCallback(() => {
    sfx.ability();
    void haptic('light');
  }, []);

  // espelha no React só o que a UI mostra (marcadores e modo especial)
  const syncMeta = useCallback((g: Game) => {
    if (g.charge !== chargeRef.current) {
      chargeRef.current = g.charge;
      setCharge(g.charge);
    }
    if (g.redCharge !== redChargeRef.current) {
      redChargeRef.current = g.redCharge;
      setRedCharge(g.redCharge);
    }
    if (g.isAbilityActive !== abilityRef.current) {
      abilityRef.current = g.isAbilityActive;
      setAbility(g.isAbilityActive);
    }
    // contagem regressiva em 5 degraus: a barra esvazia durante a habilidade
    const left = computeAbilityPips(g);
    if (left !== abilityPipsRef.current) {
      abilityPipsRef.current = left;
      setAbilityPips(left);
    }
  }, []);

  // reinicia modelo, visual e contadores do HUD — o início da partida e a volta
  // ao título compartilham exatamente o mesmo reset
  const resetGame = useCallback(() => {
    gameRef.current = createGame();
    boostRef.current = false;
    fxRef.current = { waveStart: -1, pattern: 0 };
    setBoost(false);
    chargeRef.current = 0;
    setCharge(0);
    redChargeRef.current = 0;
    setRedCharge(0);
    abilityRef.current = false;
    setAbility(false);
    abilityPipsRef.current = 0;
    setAbilityPips(0);
    setScore(0);
  }, []);

  const start = useCallback(() => {
    sfx.start();
    resetGame();
    statusRef.current = 'running';
    setStatus('running');
  }, [resetGame]);

  const enqueue = useCallback((d: Dir) => {
    if (statusRef.current !== 'running') return;
    const g = gameRef.current;
    const last = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
    if (d.x === -last.x && d.y === -last.y) return;
    if (d.x === last.x && d.y === last.y) return;
    if (g.queue.length < 2) g.queue.push(d);
  }, []);

  // turbo (Espaço ou botão na tela): alterna entre velocidade normal e turbo
  const toggleBoost = useCallback(() => {
    const next = !boostRef.current;
    if (next && statusRef.current !== 'running') return;
    boostRef.current = next;
    setBoost(next);
  }, []);

  // swipe no tabuleiro: um arrasto curto equivale a uma seta
  const onTouchStart = useCallback((e: TouchEvent<HTMLCanvasElement>) => {
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: TouchEvent<HTMLCanvasElement>) => {
      const start = swipeRef.current;
      swipeRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.hypot(dx, dy) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) enqueue(dx > 0 ? DIRS.RIGHT : DIRS.LEFT);
      else enqueue(dy > 0 ? DIRS.DOWN : DIRS.UP);
    },
    [enqueue]
  );

  const pause = useCallback(() => {
    if (statusRef.current !== 'running') return;
    boostRef.current = false;
    setBoost(false);
    statusRef.current = 'paused';
    setStatus('paused');
    sfx.pause();
  }, []);

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return;
    statusRef.current = 'running';
    setStatus('running');
    sfx.start();
  }, []);

  const exitToTitle = useCallback(() => {
    resetGame();
    statusRef.current = 'idle';
    setStatus('idle');
    sfx.click();
  }, [resetGame]);

  const toggleMute = useCallback(() => {
    const next = sfx.toggleMuted();
    setMuted(next);
    if (!next) sfx.click();
  }, []);

  // loop principal (requestAnimationFrame) — monta uma única vez
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(now - last, 200);
      last = now;

      const g = gameRef.current;
      let t = 1;

      if (statusRef.current === 'running') {
        // D6: a habilidade só expira no começo do quadro seguinte.
        // Se a barra encheu durante o efeito, a próxima habilidade emenda.
        advanceAbility(g, dt, onAbility);

        g.acc += dt;
        let interval = stepInterval(g, boostRef.current);
        let guard = 0;
        while (g.acc >= interval && guard < 4) {
          g.acc -= interval;
          guard++;
          if (!step(g, onEat, onCut, onAbility)) {
            statusRef.current = 'over';
            setStatus('over');
            sfx.die();
            boostRef.current = false;
            setBoost(false);
            g.isAbilityActive = false;
            g.abilityTimer = 0;
            break;
          }
          interval = stepInterval(g, boostRef.current);
        }
        if (statusRef.current === 'running') t = Math.min(g.acc / interval, 1);
      }

      syncMeta(g);
      draw(ctx, g, t, now, fxRef.current, boostRef.current);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [onEat, onCut, onAbility, syncMeta]);

  // teclado: setas/WASD movem, barra de espaço alterna o turbo (ou inicia/reinicia)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (statusRef.current === 'running') pause();
        else if (statusRef.current === 'paused') resume();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (statusRef.current === 'paused') {
          resume();
          return;
        }
        if (statusRef.current !== 'running') {
          start();
          return;
        }
        if (!e.repeat) toggleBoost();
        return;
      }
      const d = KEY_MAP[e.key];
      if (!d) return;
      e.preventDefault();
      enqueue(d);
    };
    const onBlur = () => {
      boostRef.current = false;
      setBoost(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [start, enqueue, pause, resume, toggleBoost]);

  const newRecord = status === 'over' && score > 0 && score >= best;
  // durante a habilidade a barra esvazia (contagem regressiva); fora dela mostra a carga
  const pips = ability ? abilityPips : charge;

  return (
    <div className="app">
      <h1 className="title">🐍 Snake Rush</h1>

      <div className="hud">
        <div className="card cyan">
          <span className="label">Pontos</span>
          <span className="value">{score}</span>
        </div>
        <div className="card pink">
          <span className="label">Recorde</span>
          <span className="value">{best}</span>
        </div>
        <div
          className={`card charge${ability ? ' active' : ''}`}
          role="group"
          aria-label="Habilidade"
        >
          <span className="label">Habilidade</span>
          <div
            className="pips red"
            role="progressbar"
            aria-label="Vermelhos coletados"
            aria-valuemin={0}
            aria-valuemax={ABILITY_THRESHOLD}
            aria-valuenow={redCharge}
          >
            {Array.from({ length: ABILITY_THRESHOLD }, (_, i) => (
              <i key={i} className={i < redCharge ? 'on' : undefined} />
            ))}
          </div>
          <div
            className="pips"
            role="progressbar"
            aria-label="Laranjas coletadas"
            aria-valuemin={0}
            aria-valuemax={ABILITY_THRESHOLD}
            aria-valuenow={pips}
          >
            {Array.from({ length: ABILITY_THRESHOLD }, (_, i) => (
              <i key={i} className={i < pips ? 'on' : undefined} />
            ))}
          </div>
        </div>
        <button
          className="mute-btn"
          onClick={toggleMute}
          aria-label={muted ? 'Ativar som' : 'Desativar som'}
          title={muted ? 'Ativar som (M)' : 'Desativar som'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      <div className={`board-wrap${ability ? ' is-ability' : boost ? ' is-turbo' : ''}`}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-label="Tabuleiro do jogo"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        />

        {status !== 'running' && (
          <div className="overlay">
            <div className="box">
              {status === 'paused' ? (
                <>
                  <h2>⏸ Jogo Pausado</h2>
                  <p>O tabuleiro parou. O que você quer fazer?</p>
                  <div className="actions">
                    <button className="btn" onClick={resume}>
                      ▶ Resumir
                    </button>
                    <button className="btn secondary" onClick={start}>
                      ↻ Resetar estágio
                    </button>
                    <button className="btn ghost" onClick={exitToTitle}>
                      ⏏ Sair do jogo
                    </button>
                  </div>
                  <p className="hint">
                    <kbd>Esc</kbd> pausa e retoma · <kbd>Espaço</kbd> alterna o turbo
                  </p>
                </>
              ) : (
                <>
                  <h2>{status === 'idle' ? 'Snake Rush' : 'Fim de Jogo'}</h2>
                  {status === 'idle' ? (
                    <p>
                      Setas ou WASD para mover. Aperte a barra de espaço para alternar o turbo.
                      A cada 5 recursos surge um bloco laranja: coma 5 para ativar a habilidade.
                    </p>
                  ) : (
                    <p>
                      Você marcou {score} pontos{newRecord ? ' — novo recorde!' : '!'}
                    </p>
                  )}
                  {newRecord && <p className="record">🏆 Novo recorde!</p>}
                  <button className="btn" onClick={start}>
                    {status === 'idle' ? 'Iniciar' : 'Jogar novamente'}
                  </button>
                  <p className="hint">
                    Dica: <kbd>Espaço</kbd> alterna o turbo, <kbd>Esc</kbd> pausa o jogo.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="dpad">
        <button
          className="pad-btn up"
          aria-label="Cima"
          onClick={(e) => {
            e.currentTarget.blur();
            enqueue(BTN_MAP.up);
          }}
        >
          ↑
        </button>
        <button
          className="pad-btn left"
          aria-label="Esquerda"
          onClick={(e) => {
            e.currentTarget.blur();
            enqueue(BTN_MAP.left);
          }}
        >
          ←
        </button>
        <button
          className="pad-btn down"
          aria-label="Baixo"
          onClick={(e) => {
            e.currentTarget.blur();
            enqueue(BTN_MAP.down);
          }}
        >
          ↓
        </button>
        <button
          className="pad-btn right"
          aria-label="Direita"
          onClick={(e) => {
            e.currentTarget.blur();
            enqueue(BTN_MAP.right);
          }}
        >
          →
        </button>
      </div>

      <button
        className={`turbo-btn${boost ? ' on' : ''}`}
        aria-label={boost ? 'Turbo: desligar' : 'Turbo: ligar'}
        aria-pressed={boost}
        onClick={(e) => {
          e.preventDefault();
          e.currentTarget.blur();
          toggleBoost();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        ⚡ Turbo: {boost ? 'turbo' : 'normal'}
      </button>

      <p className="info">
        Controles: setas do teclado, <kbd>WASD</kbd>, os botões abaixo ou um arrasto no
        tabuleiro. Aperte <kbd>Espaço</kbd> ou toque no botão de turbo para alternar entre
        velocidade normal e turbo, e <kbd>Esc</kbd> para pausar. A cada 5 recursos vermelhos
        nasce um bloco laranja de 4 células (40 pts e
        +3 gomos) — a cada 5 blocos a habilidade ativa por 4 s: turbo, corte do próprio corpo
        (20 pts por gomo) e crescimento 3× ao comer. Fora da habilidade, encostar na parede ou
        no corpo encerra a partida.
      </p>
    </div>
  );
}
