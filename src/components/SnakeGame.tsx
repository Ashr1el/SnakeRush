'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import {
  ABILITY_THRESHOLD,
  CELL,
  COLS,
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

const UP: Dir = { x: 0, y: -1 };
const DOWN: Dir = { x: 0, y: 1 };
const LEFT: Dir = { x: -1, y: 0 };
const RIGHT: Dir = { x: 1, y: 0 };

const KEY_MAP: Record<string, Dir> = {
  ArrowUp: UP,
  ArrowDown: DOWN,
  ArrowLeft: LEFT,
  ArrowRight: RIGHT,
  w: UP,
  W: UP,
  s: DOWN,
  S: DOWN,
  a: LEFT,
  A: LEFT,
  d: RIGHT,
  D: RIGHT,
};

const BTN_MAP: Record<string, Dir> = { up: UP, down: DOWN, left: LEFT, right: RIGHT };

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

function draw(ctx: CanvasRenderingContext2D, g: Game, t: number, now: number) {
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

  // cobra com interpolação entre células (movimento suave)
  const n = g.snake.length;
  for (let i = n - 1; i >= 0; i--) {
    const seg = g.snake[i];
    const p = g.prev[i] ?? seg;
    const x = (p.x + (seg.x - p.x) * t) * CELL;
    const y = (p.y + (seg.y - p.y) * t) * CELL;
    const k = n > 1 ? i / (n - 1) : 0;
    const hue = 160 + k * 120; // verde -> roxo ao longo do corpo
    const size = i === 0 ? CELL - 2 : CELL - 4;
    const off = (CELL - size) / 2;

    ctx.save();
    if (i === 0) {
      ctx.shadowColor = `hsla(${hue}, 90%, 60%, 0.85)`;
      ctx.shadowBlur = 16;
    }
    ctx.fillStyle = `hsl(${hue} 85% ${55 - k * 10}%)`;
    roundedRect(ctx, x + off, y + off, size, size, i === 0 ? 8 : 6);
    ctx.fill();
    ctx.restore();

    if (i === 0) drawEyes(ctx, x, y, g.dir);
  }

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
  const abilityRef = useRef(false);
  const abilityPipsRef = useRef(0);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [boost, setBoost] = useState(false);
  const [muted, setMuted] = useState(false);
  const [charge, setCharge] = useState(0);
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
      if (kind === 'special') void haptic('light');
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

  // espelha no React só o que a UI mostra (barra de carga e modo especial)
  const syncMeta = useCallback((g: Game) => {
    if (g.charge !== chargeRef.current) {
      chargeRef.current = g.charge;
      setCharge(g.charge);
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

  const start = useCallback(() => {
    sfx.start();
    gameRef.current = createGame();
    boostRef.current = false;
    setBoost(false);
    chargeRef.current = 0;
    setCharge(0);
    abilityRef.current = false;
    setAbility(false);
    abilityPipsRef.current = 0;
    setAbilityPips(0);
    setScore(0);
    statusRef.current = 'running';
    setStatus('running');
  }, []);

  const enqueue = useCallback((d: Dir) => {
    if (statusRef.current !== 'running') return;
    const g = gameRef.current;
    const last = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
    if (d.x === -last.x && d.y === -last.y) return;
    if (d.x === last.x && d.y === last.y) return;
    if (g.queue.length < 2) g.queue.push(d);
  }, []);

  // turbo pelo botão na tela (press-and-hold), mesmo caminho do Espaço
  const setBoostHeld = useCallback((on: boolean) => {
    if (on && statusRef.current !== 'running') return;
    boostRef.current = on;
    setBoost(on);
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
      if (Math.abs(dx) > Math.abs(dy)) enqueue(dx > 0 ? RIGHT : LEFT);
      else enqueue(dy > 0 ? DOWN : UP);
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
    gameRef.current = createGame();
    boostRef.current = false;
    setBoost(false);
    chargeRef.current = 0;
    setCharge(0);
    abilityRef.current = false;
    setAbility(false);
    abilityPipsRef.current = 0;
    setAbilityPips(0);
    setScore(0);
    statusRef.current = 'idle';
    setStatus('idle');
    sfx.click();
  }, []);

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
      draw(ctx, g, t, now);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [onEat, onCut, onAbility, syncMeta]);

  // teclado: setas/WASD movem, barra de espaço dá turbo (ou inicia/reinicia)
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
        if (!e.repeat) {
          boostRef.current = true;
          setBoost(true);
        }
        return;
      }
      const d = KEY_MAP[e.key];
      if (!d) return;
      e.preventDefault();
      enqueue(d);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        boostRef.current = false;
        setBoost(false);
      }
    };
    const onBlur = () => {
      boostRef.current = false;
      setBoost(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [start, enqueue, pause, resume]);

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
          role="progressbar"
          aria-label="Laranjas coletadas"
          aria-valuemin={0}
          aria-valuemax={ABILITY_THRESHOLD}
          aria-valuenow={pips}
        >
          <span className="label">{ability ? 'Habilidade' : 'Laranjas'}</span>
          <div className="pips" aria-hidden="true">
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
                    <kbd>Esc</kbd> pausa e retoma · <kbd>Espaço</kbd> turbo
                  </p>
                </>
              ) : (
                <>
                  <h2>{status === 'idle' ? 'Snake Rush' : 'Fim de Jogo'}</h2>
                  {status === 'idle' ? (
                    <p>
                      Setas ou WASD para mover. Segure a barra de espaço para acelerar. A cada 5
                      recursos surge um bloco laranja: coma 5 para ativar a habilidade.
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
                    Dica: <kbd>Espaço</kbd> ativa o turbo, <kbd>Esc</kbd> pausa o jogo.
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
        aria-label="Turbo: segure para acelerar"
        onPointerDown={(e) => {
          e.preventDefault();
          setBoostHeld(true);
        }}
        onPointerUp={() => setBoostHeld(false)}
        onPointerCancel={() => setBoostHeld(false)}
        onPointerLeave={() => setBoostHeld(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        ⚡ Segure para turbo
      </button>

      <p className="info">
        Controles: setas do teclado, <kbd>WASD</kbd>, os botões abaixo ou um arrasto no tabuleiro.
        Segure <kbd>Espaço</kbd> (ou o botão de turbo) para acelerar e <kbd>Esc</kbd> para pausar.
        A cada 5 recursos nasce um bloco laranja de 4 células (40 pts e +3 gomos) — a cada 5
        blocos a habilidade ativa por 4 s: turbo, corte do próprio corpo (20 pts por gomo) e
        crescimento 3× ao comer. Fora da habilidade, encostar na parede ou no corpo encerra a
        partida.
      </p>
    </div>
  );
}