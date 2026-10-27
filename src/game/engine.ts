// Núcleo do jogo: modelo de dados, regras e ritmo. Sem React e sem DOM,
// para poder ser testado com `npm test` (node --test).

export type Cell = { x: number; y: number };
export type Dir = { x: number; y: number };

export const COLS = 20;
export const ROWS = 20;
export const CELL = 20;
export const W = COLS * CELL;
export const H = ROWS * CELL;

export const BASE_SPEED = 130; // ms por passo
export const MIN_SPEED = 70; // velocidade máxima
export const SPEED_STEP = 3; // ms mais rápido a cada comida
export const BOOST_FACTOR = 0.5; // turbo da barra de espaço
export const ABILITY_THRESHOLD = 5; // frutas para encher a barra de carga
export const ABILITY_DURATION_MS = 2000; // duração do modo especial (2 s)
export const ABILITY_SPEED_FACTOR = 0.5; // intervalo ×0.5 durante a habilidade (D2)
export const CUT_BONUS_PER_SEGMENT = 20; // bônus por segmento cortado (200% de 10)

export interface Game {
  snake: Cell[];
  prev: Cell[];
  dir: Dir;
  queue: Dir[];
  food: Cell;
  score: number;
  speed: number;
  acc: number;
  deathAt: number;
  foodCount: number; // carga da barra (0 a ABILITY_THRESHOLD)
  isAbilityActive: boolean; // modo especial de turbo + auto-corte
  abilityTimer: number; // ms restantes da habilidade
}

const UP: Dir = { x: 0, y: -1 };
const DOWN: Dir = { x: 0, y: 1 };
const LEFT: Dir = { x: -1, y: 0 };
const RIGHT: Dir = { x: 1, y: 0 };

export function placeFood(g: Game) {
  const free: Cell[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!g.snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
    }
  }
  g.food = free.length ? free[Math.floor(Math.random() * free.length)] : { x: 0, y: 0 };
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
    food: { x: 0, y: 0 },
    score: 0,
    speed: BASE_SPEED,
    acc: 0,
    deathAt: 0,
    foodCount: 0,
    isAbilityActive: false,
    abilityTimer: 0,
  };
  placeFood(g);
  return g;
}

/**
 * Avança um passo da simulação.
 * @returns `false` quando a partida termina (parede ou corpo sem habilidade).
 */
export function step(
  g: Game,
  onEat: (score: number) => void,
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

  const eat = head.x === g.food.x && head.y === g.food.y;
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
  g.snake = eat ? [head, ...g.snake] : [head, ...g.snake.slice(0, -1)];

  if (eat) {
    g.score += 10;
    g.speed = Math.max(MIN_SPEED, g.speed - SPEED_STEP);

    if (g.isAbilityActive) {
      // durante a habilidade a barra só acompanha o próximo ciclo
      g.foodCount = Math.min(g.foodCount + 1, ABILITY_THRESHOLD);
    } else if (g.foodCount < ABILITY_THRESHOLD) {
      g.foodCount += 1;
    } else {
      // D1: barra cheia na 5ª fruta; a recolha seguinte ativa e zera o ciclo
      g.foodCount = 0;
      g.isAbilityActive = true;
      g.abilityTimer = ABILITY_DURATION_MS;
      onAbility();
    }

    placeFood(g);
    onEat(g.score);
  }
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
  if (!g.isAbilityActive) return 0;
  return Math.max(1, Math.ceil((g.abilityTimer / ABILITY_DURATION_MS) * ABILITY_THRESHOLD));
}

export const DIRS = { UP, DOWN, LEFT, RIGHT };
