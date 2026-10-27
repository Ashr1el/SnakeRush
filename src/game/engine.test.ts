// Testes do núcleo do jogo. Rodam com `npm test` (node --test + type stripping).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ABILITY_DURATION_MS,
  ABILITY_GROWTH_FACTOR,
  ABILITY_THRESHOLD,
  BASE_SPEED,
  CUT_BONUS_PER_SEGMENT,
  GROWTH_NORMAL,
  GROWTH_SPECIAL,
  MIN_SPEED,
  POINTS_NORMAL,
  POINTS_SPECIAL,
  SPEED_STEP,
  abilityPips,
  advanceAbility,
  createGame,
  placeFood,
  step,
  stepInterval,
  type Cell,
  type FoodKind,
  type Game,
} from './engine.ts';

const noop = () => {};

/** Célula à frente da cabeça (onde o próximo passo vai bater). */
function ahead(g: Game): Cell {
  return { x: g.snake[0].x + g.dir.x, y: g.snake[0].y + g.dir.y };
}

/**
 * Reposiciona a cobra no centro, olhando para a direita. Usado nos testes que
 * fazem muitas coletas seguidas (a cobra não pode bater na parede).
 */
function resetSnake(g: Game, length = 3) {
  g.snake = [];
  for (let i = 0; i < length; i++) g.snake.push({ x: 10 - i, y: 10 });
  g.prev = g.snake.map((c) => ({ ...c }));
  g.dir = { x: 1, y: 0 };
}

/**
 * Substitui o recurso atual por um recurso conhecido e dá um passo.
 * `extraCells` > 0 transforma o recurso em um bloco laranja.
 */
function feed(g: Game, kind: FoodKind, extraCells = kind === 'special' ? 3 : 0): boolean {
  const head = ahead(g);
  const cells: Cell[] = [{ ...head }];
  for (let i = 0; i < extraCells; i++) cells.push({ x: head.x + i + 1, y: head.y });
  g.food = { kind, cells };
  return step(g, noop, noop, noop);
}

test('sequência de geração: 4 vermelhos e 1 laranja', () => {
  const g = createGame(); // já gera o 1º recurso
  const kinds: FoodKind[] = [g.food.kind];
  for (let i = 0; i < 9; i++) {
    placeFood(g);
    kinds.push(g.food.kind);
  }

  assert.deepEqual(kinds, [
    'normal',
    'normal',
    'normal',
    'normal',
    'special',
    'normal',
    'normal',
    'normal',
    'normal',
    'special',
  ]);
});

test('recurso laranja ocupa 4 células em bloco 2×2 e nunca sobre a cobra', () => {
  const g = createGame();

  for (let i = 0; i < 100; i++) {
    placeFood(g);
    if (g.food.kind !== 'special') continue;
    assert.equal(g.food.cells.length, 4);

    const xs = [...new Set(g.food.cells.map((c) => c.x))].sort((a, b) => a - b);
    const ys = [...new Set(g.food.cells.map((c) => c.y))].sort((a, b) => a - b);
    assert.equal(xs.length, 2, 'duas colunas');
    assert.equal(ys.length, 2, 'duas linhas');
    assert.equal(xs[1] - xs[0], 1, 'colunas vizinhas');
    assert.equal(ys[1] - ys[0], 1, 'linhas vizinhas');

    for (const c of g.food.cells) {
      assert.ok(c.x >= 0 && c.x < 20 && c.y >= 0 && c.y < 20, 'dentro do tabuleiro');
      assert.equal(
        g.snake.some((s) => s.x === c.x && s.y === c.y),
        false,
        'célula livre'
      );
    }
  }
});

test('tabuleiro apertado: laranja cai para 1 célula livre', () => {
  const g = createGame();
  g.snake = [];
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      if (y === 0 && (x === 0 || x === 2 || x === 4)) continue;
      g.snake.push({ x, y });
    }
  }

  g.spawns = 4; // força o próximo a ser laranja
  placeFood(g);

  assert.equal(g.food.kind, 'special');
  assert.equal(g.food.cells.length, 1);
  assert.equal(g.food.cells[0].y, 0);
});

test('vermelho não carrega a barra; 5 laranjas ativam a habilidade', () => {
  const g = createGame();
  let abilityCalls = 0;
  const onAbility = () => abilityCalls++;

  for (let i = 0; i < 5; i++) {
    resetSnake(g);
    g.food = { kind: 'normal', cells: [ahead(g)] };
    step(g, noop, noop, onAbility);
  }
  assert.equal(g.charge, 0, 'vermelho não conta');
  assert.equal(g.isAbilityActive, false);

  for (let i = 1; i < ABILITY_THRESHOLD; i++) {
    resetSnake(g);
    g.food = { kind: 'special', cells: [ahead(g)] };
    step(g, noop, noop, onAbility);
    assert.equal(g.charge, i);
    assert.equal(g.isAbilityActive, false);
    assert.equal(abilityCalls, 0);
  }

  resetSnake(g);
  g.food = { kind: 'special', cells: [ahead(g)] };
  step(g, noop, noop, onAbility);

  assert.equal(abilityCalls, 1, 'o 5º laranja ativa na hora');
  assert.equal(g.isAbilityActive, true);
  assert.equal(g.charge, 0, 'ciclo reiniciado');
  assert.equal(g.abilityTimer, ABILITY_DURATION_MS);
  assert.equal(ABILITY_DURATION_MS, 4000, 'efeito dura 4 s');
});

test('pontuação: vermelho 10, laranja 40', () => {
  const g = createGame();

  g.food = { kind: 'normal', cells: [ahead(g)] };
  step(g, noop, noop, noop);
  assert.equal(g.score, POINTS_NORMAL);

  g.food = { kind: 'special', cells: [ahead(g)] };
  step(g, noop, noop, noop);
  assert.equal(g.score, POINTS_NORMAL + POINTS_SPECIAL);
});

test('marcador vermelho: conta até 5 e zera quando a habilidade ativa', () => {
  const g = createGame();

  for (let i = 1; i <= 5; i++) {
    resetSnake(g);
    g.food = { kind: 'normal', cells: [ahead(g)] };
    step(g, noop, noop, noop);
    assert.equal(g.redCharge, i);
    assert.equal(g.charge, 0, 'vermelho não mexe na barra de laranjas');
  }

  resetSnake(g);
  g.food = { kind: 'normal', cells: [ahead(g)] };
  step(g, noop, noop, noop);
  assert.equal(g.redCharge, 5, 'não passa de 5');

  g.charge = ABILITY_THRESHOLD - 1;
  resetSnake(g);
  g.food = { kind: 'special', cells: [ahead(g)] };
  step(g, noop, noop, noop);

  assert.equal(g.isAbilityActive, true);
  assert.equal(g.charge, 0);
  assert.equal(g.redCharge, 0, 'os dois marcadores reiniciam juntos');
});

test('crescimento fora da habilidade: vermelho +1, laranja +3', () => {
  const g = createGame();
  assert.equal(g.snake.length, 3);

  feed(g, 'normal');
  assert.equal(g.snake.length, 3 + GROWTH_NORMAL);

  feed(g, 'special');
  assert.equal(g.snake.length, 3 + GROWTH_NORMAL + GROWTH_SPECIAL);

  // comeu as 4 células do bloco de uma vez (a cabeça entra em uma delas)
  assert.equal(GROWTH_SPECIAL, 3);
});

test('bloco laranja é coletado ao encostar em qualquer das 4 células', () => {
  const g = createGame();
  const head = ahead(g);
  g.food = {
    kind: 'special',
    cells: [
      { x: head.x + 1, y: head.y },
      { x: head.x + 1, y: head.y + 1 },
      { x: head.x, y: head.y + 1 },
      { x: head.x, y: head.y }, // a célula em que a cabeça vai entrar
    ],
  };
  const before = g.snake.length;

  assert.equal(step(g, noop, noop, noop), true);
  assert.equal(g.snake.length, before + GROWTH_SPECIAL);
  assert.equal(g.charge, 1);
});

test('durante a habilidade o crescimento é 3× (vermelho 3, laranja 9)', () => {
  const g = createGame();
  g.isAbilityActive = true;
  g.abilityTimer = ABILITY_DURATION_MS;

  const start = g.snake.length;
  feed(g, 'normal');
  assert.equal(g.snake.length, start + GROWTH_NORMAL * ABILITY_GROWTH_FACTOR);

  const afterRed = g.snake.length;
  feed(g, 'special');
  assert.equal(g.snake.length, afterRed + GROWTH_SPECIAL * ABILITY_GROWTH_FACTOR);

  assert.equal(ABILITY_GROWTH_FACTOR, 3);
});

test('velocidade sobe a cada recurso até o mínimo', () => {
  const g = createGame();
  assert.equal(g.speed, BASE_SPEED);

  for (let i = 1; i <= 3; i++) {
    feed(g, 'normal');
    assert.equal(g.speed, BASE_SPEED - SPEED_STEP * i);
  }

  g.speed = MIN_SPEED + 1;
  feed(g, 'normal');
  assert.equal(g.speed, MIN_SPEED, 'não passa do mínimo');
});

test('stepInterval: turbo pela metade e sem acúmulo com a habilidade', () => {
  const g = createGame();
  g.speed = 100;

  assert.equal(stepInterval(g, false), 100);
  assert.equal(stepInterval(g, true), 50, 'turbo do Espaço: ×0.5');

  g.isAbilityActive = true;
  assert.equal(stepInterval(g, false), 50, 'habilidade: ×0.5');
  assert.equal(stepInterval(g, true), 50, 'D3: habilidade não acumula com o turbo');
});

test('colisão com o próprio corpo encerra a partida sem habilidade', () => {
  const g = createGame();
  // cabeça em {5,5} indo para a direita: {6,5} é um gomo do meio (não a cauda)
  g.snake = [
    { x: 5, y: 5 },
    { x: 4, y: 5 },
    { x: 4, y: 6 },
    { x: 5, y: 6 },
    { x: 6, y: 6 },
    { x: 6, y: 5 },
    { x: 7, y: 5 },
  ];
  g.prev = g.snake.map((c) => ({ ...c }));
  g.dir = { x: 1, y: 0 };
  g.food = { kind: 'normal', cells: [{ x: 0, y: 0 }] };

  assert.equal(step(g, noop, noop, noop), false);
  assert.ok(g.deathAt > 0);
});

test('parede encerra a partida', () => {
  const g = createGame();
  g.snake = [{ x: 19, y: 10 }];
  g.dir = { x: 1, y: 0 };
  g.food = { kind: 'normal', cells: [{ x: 0, y: 0 }] };

  assert.equal(step(g, noop, noop, noop), false);
  assert.ok(g.deathAt > 0);
});

test('com habilidade, bater no corpo corta e paga bônus por gomo', () => {
  const g = createGame();
  g.snake = [
    { x: 5, y: 5 },
    { x: 4, y: 5 },
    { x: 4, y: 6 },
    { x: 5, y: 6 },
    { x: 6, y: 6 },
    { x: 6, y: 5 },
    { x: 7, y: 5 },
  ];
  g.prev = g.snake.map((c) => ({ ...c }));
  g.dir = { x: 1, y: 0 };
  g.isAbilityActive = true;
  g.abilityTimer = ABILITY_DURATION_MS;
  g.food = { kind: 'normal', cells: [{ x: 0, y: 0 }] };
  g.score = 0;

  let cutScore = -1;
  let cutSegments = -1;
  const alive = step(
    g,
    noop,
    (score, segments) => {
      cutScore = score;
      cutSegments = segments;
    },
    noop
  );

  assert.equal(alive, true, 'D6: a habilidade vale até o fim do quadro');
  // o gomo atingido está no índice 5 do corpo → corta 2 gomos
  assert.equal(cutSegments, 2);
  assert.equal(g.score, 2 * CUT_BONUS_PER_SEGMENT);
  assert.equal(cutScore, g.score);
  assert.deepEqual(g.snake, [
    { x: 6, y: 5 },
    { x: 5, y: 5 },
    { x: 4, y: 5 },
    { x: 4, y: 6 },
    { x: 5, y: 6 },
    { x: 6, y: 6 },
  ]);
});

test('abilityPips: carga fora da habilidade e contagem 5 → 1 durante os 4 s', () => {
  const g = createGame();
  assert.equal(abilityPips(g), 0);

  g.charge = 3;
  assert.equal(abilityPips(g), 3, 'fora da habilidade mostra a carga');

  g.isAbilityActive = true;
  const cases: Array<[number, number]> = [
    [ABILITY_DURATION_MS, 5],
    [3201, 5],
    [3200, 4],
    [1600, 2],
    [400, 1],
    [0, 1],
  ];
  for (const [timer, expected] of cases) {
    g.abilityTimer = timer;
    assert.equal(abilityPips(g), expected, `timer ${timer}`);
  }
});

test('advanceAbility encerra no fim e emenda se a barra encheu', () => {
  const g = createGame();
  let calls = 0;
  const onAbility = () => calls++;

  g.isAbilityActive = true;
  g.abilityTimer = ABILITY_DURATION_MS;
  g.charge = ABILITY_THRESHOLD;

  advanceAbility(g, 1000, onAbility);
  assert.equal(g.isAbilityActive, true);
  assert.equal(g.abilityTimer, 3000);
  assert.equal(calls, 0);

  advanceAbility(g, 3000, onAbility);
  assert.equal(calls, 1, 'emenda ao terminar');
  assert.equal(g.isAbilityActive, true);
  assert.equal(g.abilityTimer, ABILITY_DURATION_MS);
  assert.equal(g.charge, 0);

  // sem carga, expira e volta ao normal
  advanceAbility(g, ABILITY_DURATION_MS, onAbility);
  assert.equal(g.isAbilityActive, false);
  assert.equal(g.abilityTimer, 0);
  assert.equal(calls, 1);
});

test('fila de direções ignora inversão de 180°', () => {
  const g = createGame();
  g.dir = { x: 1, y: 0 };
  g.food = { kind: 'normal', cells: [{ x: 0, y: 0 }] };
  g.queue.push({ x: -1, y: 0 });
  g.queue.push({ x: 0, y: 1 });

  step(g, noop, noop, noop);

  assert.deepEqual(g.dir, { x: 0, y: 1 }, 'a inversão é descartada e vale a próxima');
  assert.deepEqual(g.snake[0], { x: 10, y: 11 });
});
