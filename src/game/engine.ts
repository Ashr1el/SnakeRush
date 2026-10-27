// Núcleo do jogo: modelo de dados, regras e ritmo. Sem React e sem DOM,
// para poder ser testado com `npm test` (node --test).

export type Cell = { x: number; y: number };
export type Dir = { x: number; y: number };
export type FoodKind = 'normal' | 'special';

export interface Food {
  kind: FoodKind;
  /** 1 célula no recurso normal; 4 células (bloco 2×2) no recurso laranja. */
  cells: Cell[];
}

export const COLS = 20;
export const ROWS = 20;
export const CELL = 20;
export const W = COLS * CELL;
export const H = ROWS * CELL;

export const BASE_SPEED = 130; // ms por passo
export const MIN_SPEED = 70; // velocidade máxima
export const SPEED_STEP = 3; // ms mais rápido a cada recurso
export const BOOST_FACTOR = 0.5; // turbo da barra de espaço
export const SPECIAL_EVERY = 5; // 1 recurso laranja a cada 5 gerados (4 vermelhos + 1 laranja)
export const ABILITY_THRESHOLD = 5; // laranjas para ativar a habilidade
export const ABILITY_DURATION_MS = 4000; // duração do modo especial (4 s)
export const ABILITY_SPEED_FACTOR = 0.5; // intervalo ×0.5 durante a habilidade (D2)
export const ABILITY_GROWTH_FACTOR = 3; // crescimento ×3 durante a habilidade
export const CUT_BONUS_PER_SEGMENT = 20; // bônus por segmento cortado (200% de 10)
export const POINTS_NORMAL = 10; // pontos por recurso vermelho
export const POINTS_SPECIAL = 40; // pontos por bloco laranja (4 células × 10)
export const GROWTH_NORMAL = 1; // gomos por recurso vermelho
export const GROWTH_SPECIAL = 3; // gomos por bloco laranja (ocupa 4 células)

export interface Game {
  snake: Cell[];
  prev: Cell[];
  dir: Dir;
  queue: Dir[];
  food: Food;
  spawns: number; // recursos gerados (define a sequência 4 vermelhos : 1 laranja)
  score: number;
  speed: number;
  acc: number;
  deathAt: number;
  charge: number; // laranjas coletados no ciclo (0 até ABILITY_THRESHOLD)
  isAbilityActive: boolean; // modo especial de turbo + auto-corte
  abilityTimer: number; // ms restantes da habilidade
}

const UP: Dir = { x: 0, y: -1 };
const DOWN: Dir = { x: 0, y: 1 };
const LEFT: Dir = { x: -1, y: 0 };
const RIGHT: Dir = { x: 1, y: 0 };

function onSnake(g: Game, x: number, y: number): boolean {
  return g.snake.some((s) => s.x === x && s.y === y);
}

/**
 * Sorteia o próximo recurso respeitando a sequência 4 vermelhos : 1 laranja.
 * O laranja é um bloco 2×2 (4 células) encaixado em área livre; se o tabuleiro
 * estiver apertado demais, cai para uma única célula laranja.
 */
export function placeFood(g: Game) {
  const wantsSpecial = g.spawns % SPECIAL_EVERY === SPECIAL_EVERY - 1;
  g.spawns += 1;

  if (wantsSpecial) {
    const spots: Cell[] = [];
    for (let y = 0; y < ROWS - 1; y++) {
      for (let x = 0; x < COLS - 1; x++) {
        if (
          !onSnake(g, x, y) &&
          !onSnake(g, x + 1, y) &&
          !onSnake(g, x, y + 1) &&
          !onSnake(g, x + 1, y + 1)
        ) {
          spots.push({ x, y });
        }
      }
    }
    if (spots.length) {
      const at = spots[Math.floor(Math.random() * spots.length)];
      g.food = {
        kind: 'special',
        cells: [
          { x: at.x, y: at.y },
          { x: at.x + 1, y: at.y },
          { x: at.x, y: at.y + 1 },
          { x: at.x + 1, y: at.y + 1 },
        ],
      };
      return;
    }
  }

  const free: Cell[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!onSnake(g, x, y)) free.push({ x, y });
    }
  }
  const cell = free.length
    ? free[Math.floor(Math.random() * free.length)]
    : { x: 0, y: 0 };
  g.food = { kind: wantsSpecial ? 'special' : 'normal', cells: [cell] };
}

export function createGame(): Game {
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
    food: { kind: 'normal', cells: [{ x: 0, y: 0 }] },
    spawns: 0,
    score: 0,
    speed: BASE_SPEED,
    acc: 0,
    deathAt: 0,
    charge: 0,
    isAbilityActive: false,
    abilityTimer: 0,
  };
  placeFood(g);
  return g;
}

/** Quantos gomos a cobra ganha ao comer o recurso atual. */
function growthFor(g: Game): number {
  const base = g.food.kind === 'special' ? GROWTH_SPECIAL : GROWTH_NORMAL;
  // D9: durante a habilidade o crescimento é 3× o normal (vermelho 3, laranja 9)
  return g.isAbilityActive ? base * ABILITY_GROWTH_FACTOR : base;
}

/** Duplica a cauda até a cobra ter crescido `growth` gomos. */
function growSnake(snake: Cell[], growth: number): Cell[] {
  const tail = snake[snake.length - 1];
  for (let i = 1; i < growth; i++) snake.push({ ...tail });
  return snake;
}

/** Liga a habilidade quando a barra está cheia (e ela não está ativa). */
function startAbilityIfReady(g: Game, onAbility: () => void) {
  if (g.isAbilityActive || g.charge < ABILITY_THRESHOLD) return;
  g.charge = 0;
  g.isAbilityActive = true;
  g.abilityTimer = ABILITY_DURATION_MS;
  onAbility();
}

/**
 * Avança o relógio da habilidade. Ao expirar, se a barra tiver enchido durante
 * o efeito, a próxima habilidade já começa emendada.
 */
export function advanceAbility(g: Game, dt: number, onAbility: () => void) {
  if (!g.isAbilityActive) return;
  g.abilityTimer -= dt;
  if (g.abilityTimer > 0) return;
  g.isAbilityActive = false;
  g.abilityTimer = 0;
  startAbilityIfReady(g, onAbility);
}

/**
 * Avança um passo da simulação.
 * @returns `false` quando a partida termina (parede ou corpo sem habilidade).
 */
export function step(
  g: Game,
  onEat: (score: number, kind: FoodKind) => void,
  onCut: (score: number, segments: number) => void,
  onAbility: () => void
): boolean {
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

  const eat = g.food.cells.some((c) => c.x === head.x && c.y === head.y);
  const body = eat ? g.snake : g.snake.slice(0, -1);
  const hitIndex = body.findIndex((s) => s.x === head.x && s.y === head.y);

  if (hitIndex !== -1) {
    // habilidade inativa: regra padrão de derrota
    if (!g.isAbilityActive) {
      g.deathAt = performance.now();
      return false;
    }

    // D6: a habilidade vale até o fim deste quadro
    // auto-corte: mantém a cabeça e o trecho anterior ao gomo atingido
    const cutSegments = g.snake.length - hitIndex;
    g.prev = g.snake;
    g.snake = [head, ...g.snake.slice(0, hitIndex)];
    g.score += cutSegments * CUT_BONUS_PER_SEGMENT; // D4: 20 pts por segmento
    onCut(g.score, cutSegments);
    return true;
  }

  g.prev = g.snake;

  if (!eat) {
    g.snake = [head, ...g.snake.slice(0, -1)];
    return true;
  }

  const kind = g.food.kind;
  g.snake = growSnake([head, ...g.snake], growthFor(g));
  g.score += kind === 'special' ? POINTS_SPECIAL : POINTS_NORMAL;
  g.speed = Math.max(MIN_SPEED, g.speed - SPEED_STEP);

  // D9: só o recurso laranja carrega a barra
  if (kind === 'special') {
    g.charge = Math.min(ABILITY_THRESHOLD, g.charge + 1);
  }

  placeFood(g);
  startAbilityIfReady(g, onAbility);
  onEat(g.score, kind);
  return true;
}

/** Intervalo entre passos, considerando turbo do Espaço e habilidade. */
export function stepInterval(g: Game, boosting: boolean): number {
  // D3: a habilidade não acumula com o turbo do espaço
  if (g.isAbilityActive) return g.speed * ABILITY_SPEED_FACTOR;
  return boosting ? g.speed * BOOST_FACTOR : g.speed;
}

/** Quantos pips a barra mostra: carga normal ou contagem regressiva da habilidade. */
export function abilityPips(g: Game): number {
  if (!g.isAbilityActive) return g.charge;
  return Math.max(1, Math.ceil((g.abilityTimer / ABILITY_DURATION_MS) * ABILITY_THRESHOLD));
}

export const DIRS = { UP, DOWN, LEFT, RIGHT };
