import { useCallback, useEffect, useRef, useState } from 'react';
import { sfx } from './sound';

type Cell = { x: number; y: number };
type Dir = { x: number; y: number };
type Status = 'idle' | 'running' | 'paused' | 'over';

const COLS = 20;
const ROWS = 20;
const CELL = 20;
const W = COLS * CELL;
const H = ROWS * CELL;

const BASE_SPEED = 130; // ms por passo
const MIN_SPEED = 70; // velocidade máxima
const SPEED_STEP = 3; // ms mais rápido a cada comida
const BOOST_FACTOR = 0.5; // turbo da barra de espaço
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

interface Game {
  snake: Cell[];
  prev: Cell[];
  dir: Dir;
  queue: Dir[];
  food: Cell;
  score: number;
  speed: number;
  acc: number;
  deathAt: number;
}

function placeFood(g: Game) {
  const free: Cell[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!g.snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
    }
  }
  g.food = free.length ? free[Math.floor(Math.random() * free.length)] : { x: 0, y: 0 };
}

function createGame(): Game {
  const start: Cell[] = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  const g: Game = {
    snake: start.map((c) => ({ ...c })),
    prev: start.map((c) => ({ ...c })),
    dir: RIGHT,
    queue: [],
    food: { x: 0, y: 0 },
    score: 0,
    speed: BASE_SPEED,
    acc: 0,
    deathAt: 0,
  };
  placeFood(g);
  return g;
}

function step(g: Game, onEat: (score: number, speed: number) => void): boolean {
  // consome a fila de direções ignorando inversões ilegais
  while (g.queue.length) {
    const d = g.queue.shift()!;
    if (!(d.x === -g.dir.x && d.y === -g.dir.y)) {
      g.dir = d;
      break;
    }
  }

  const head: Cell = { x: g.snake[0].x + g.dir.x, y: g.snake[0].y + g.dir.y };

  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
    g.deathAt = performance.now();
    return false;
  }

  const eat = head.x === g.food.x && head.y === g.food.y;
  const body = eat ? g.snake : g.snake.slice(0, -1);
  if (body.some((s) => s.x === head.x && s.y === head.y)) {
    g.deathAt = performance.now();
    return false;
  }

  g.prev = g.snake;
  g.snake = eat ? [head, ...g.snake] : [head, ...g.snake.slice(0, -1)];

  if (eat) {
    g.score += 10;
    g.speed = Math.max(MIN_SPEED, g.speed - SPEED_STEP);
    placeFood(g);
    onEat(g.score, g.speed);
  }
  return true;
}

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

  // comida pulsante com brilho
  const pulse = 1 + Math.sin(now / 180) * 0.1;
  const fx = g.food.x * CELL + CELL / 2;
  const fy = g.food.y * CELL + CELL / 2;
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
  const bestRef = useRef<number>(
    typeof localStorage !== 'undefined' ? Number(localStorage.getItem(BEST_KEY) || 0) : 0
  );

  const [status, setStatus] = useState<Status>('idle');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(bestRef.current);
  const [boost, setBoost] = useState(false);
  const [speed, setSpeed] = useState(BASE_SPEED);
  const [muted, setMuted] = useState(sfx.isMuted());

  const onEat = useCallback((newScore: number, newSpeed: number) => {
    sfx.eat();
    setScore(newScore);
    setSpeed(newSpeed);
    if (newScore > bestRef.current) {
      bestRef.current = newScore;
      setBest(newScore);
      try {
        localStorage.setItem(BEST_KEY, String(newScore));
      } catch {
        /* storage indisponível */
      }
    }
  }, []);

  const start = useCallback(() => {
    sfx.start();
    gameRef.current = createGame();
    boostRef.current = false;
    setBoost(false);
    setScore(0);
    setSpeed(BASE_SPEED);
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
    setScore(0);
    setSpeed(BASE_SPEED);
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
        g.acc += dt;
        let interval = boostRef.current ? g.speed * BOOST_FACTOR : g.speed;
        let guard = 0;
        while (g.acc >= interval && guard < 4) {
          g.acc -= interval;
          guard++;
          if (!step(g, onEat)) {
            statusRef.current = 'over';
            setStatus('over');
            sfx.die();
            boostRef.current = false;
            setBoost(false);
            break;
          }
          interval = boostRef.current ? g.speed * BOOST_FACTOR : g.speed;
        }
        if (statusRef.current === 'running') t = Math.min(g.acc / interval, 1);
      }

      draw(ctx, g, t, now);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [onEat]);

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

  const pct = Math.round(((BASE_SPEED - speed) / (BASE_SPEED - MIN_SPEED)) * 100);
  const newRecord = status === 'over' && score > 0 && score >= best;

  return (
    <div className="app">
      <h1 className="title">🐍 Jogo da Cobrinha</h1>

      <div className="hud">
        <div className="card cyan">
          <span className="label">Pontos</span>
          <span className="value">{score}</span>
        </div>
        <div className="card pink">
          <span className="label">Recorde</span>
          <span className="value">{best}</span>
        </div>
        <div className="card violet">
          <span className="label">Velocidade</span>
          <div className="meter" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
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

      <div className="board-wrap">
        <canvas ref={canvasRef} width={W} height={H} aria-label="Tabuleiro do jogo" />
        {boost && status === 'running' && <div className="turbo">⚡ TURBO</div>}

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
                  <h2>{status === 'idle' ? 'Jogo da Cobrinha' : 'Fim de Jogo'}</h2>
                  {status === 'idle' ? (
                    <p>Setas ou WASD para mover. Segure a barra de espaço para acelerar.</p>
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

      <p className="info">
        Controles: setas do teclado, <kbd>WASD</kbd> ou os botões abaixo. Segure{' '}
        <kbd>Espaço</kbd> para turbinar e <kbd>Esc</kbd> para pausar (com menu para resumir,
        resetar ou sair). Coma a fruta para crescer e ganhar velocidade — sem bater nas paredes
        nem em si mesma.
      </p>
    </div>
  );
}