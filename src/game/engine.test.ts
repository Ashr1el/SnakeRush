// Testes do núcleo do jogo. Rodam com `npm test` (node --test + type stripping).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ABILITY_DURATION_MS,
  ABILITY_THRESHOLD,
  BASE_SPEED,
  CUT_BONUS_PER_SEGMENT,
  MIN_SPEED,
  SPEED_STEP,
  abilityPips,
  createGame,
  placeFood,
  step,
  stepInterval,
  type Game,
} from './engine.ts';

const noop = () => {};

function makeGame(): Game {
  return createGame();
}

/** Coloca a fruta na célula à frente da cabeça e dá um passo. */
function eatNext(g: Game) {
  g.food = { x: g.snake[0].x + g.dir.x, y: g.snake[0].y + g.dir.y };
  return step(g, noop, noop, noop);
}

test('barra enche na 5ª fruta e ativa na 6ª', () => {
  const g = makeGame();
  let abilityCalls = 0;

  for (let i = 1; i <= ABILITY_THRESHOLD; i++) {
    g.food = { x: g.snake[0].x + g.dir.x, y: g.snake[0].y + g.dir.y };
    assert.equal(step(g, noop, noop, () => abilityCalls++), true);
    assert.equal(g.foodCount, i);
    assert.equal(g.isAbilityActive, false);
  }

  assert.equal(abilityCalls, 0);
  assert.equal(g.score, ABILITY_THRESHOLD * 10);

  // a recolha seguinte libera a habilidade e reinicia o ciclo
  g.food = { x: g.snake[0].x + g.dir.x, y: g.snake[0].y + g.dir.y };
  assert.equal(step(g, noop, noop, () => abilityCalls++), true);
  assert.equal(abilityCalls, 1);
  assert.equal(g.isAbilityActive, true);
  assert.equal(g.foodCount, 0);
  assert.equal(g.abilityTimer, ABILITY_DURATION_MS);
});

test('velocidade sobe a cada fruta até o mínimo', () => {
  const g = makeGame();
  assert.equal(g.speed, BASE_SPEED);

  for (let i = 1; i <= 3; i++) {
    eatNext(g);
    assert.equal(g.speed, BASE_SPEED - SPEED_STEP * i);
  }

  g.speed = MIN_SPEED + 1;
  eatNext(g);
  assert.equal(g.speed, MIN_SPEED, 'não passa do mínimo');
});

test('stepInterval: turbo pela metade e sem acúmulo com a habilidade', () => {
  const g = makeGame();
  g.speed = 100;

  assert.equal(stepInterval(g, false), 100);
  assert.equal(stepInterval(g, true), 50, 'turbo do Espaço: ×0.5');

  g.isAbilityActive = true;
  assert.equal(stepInterval(g, false), 50, 'habilidade: ×0.5');
  assert.equal(stepInterval(g, true), 50, 'D3: habilidade não acumula com o turbo');
});

test('colisão com o próprio corpo encerra a partida sem habilidade', () => {
  const g = makeGame();
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
  g.food = { x: 0, y: 0 };

  assert.equal(step(g, noop, noop, noop), false);
  assert.ok(g.deathAt > 0);
});

test('parede encerra a partida', () => {
  const g = makeGame();
  g.snake = [{ x: 19, y: 10 }];
  g.dir = { x: 1, y: 0 };
  g.food = { x: 0, y: 0 };

  assert.equal(step(g, noop, noop, noop), false);
  assert.ok(g.deathAt > 0);
});

test('com habilidade, bater no corpo corta e paga bônus por gomo', () => {
  const g = makeGame();
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
  g.food = { x: 0, y: 0 };
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
  // o gomo atingido está no índice 2 do corpo → corta 2 gomos
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

test('fruta nunca nasce sobre a cobra', () => {
  const g = makeGame();

  for (let i = 0; i < 200; i++) {
    placeFood(g);
    const onSnake = g.snake.some((s) => s.x === g.food.x && s.y === g.food.y);
    assert.equal(onSnake, false);
  }

  // tabuleiro cheio: cai no canto em vez de laçar um laço infinito
  g.snake = [];
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) g.snake.push({ x, y });
  }
  placeFood(g);
  assert.deepEqual(g.food, { x: 0, y: 0 });
});

test('abilityPips conta de 5 até 1 durante a habilidade', () => {
  const g = makeGame();
  assert.equal(abilityPips(g), 0, 'fora da habilidade a barra usa a carga normal');

  g.isAbilityActive = true;
  const cases: Array<[number, number]> = [
    [ABILITY_DURATION_MS, ABILITY_THRESHOLD],
    [1601, 5],
    [1600, 4],
    [1200, 3],
    [700, 2],
    [400, 1],
    [0, 1],
  ];
  for (const [timer, expected] of cases) {
    g.abilityTimer = timer;
    assert.equal(abilityPips(g), expected, `timer ${timer}`);
  }
});

test('fila de direções ignora inversão de 180°', () => {
  const g = makeGame();
  g.dir = { x: 1, y: 0 };
  g.food = { x: 0, y: 0 };
  g.queue.push({ x: -1, y: 0 });
  g.queue.push({ x: 0, y: 1 });

  step(g, noop, noop, noop);

  assert.deepEqual(g.dir, { x: 0, y: 1 }, 'a inversão é descartada e vale a próxima');
  assert.deepEqual(g.snake[0], { x: 10, y: 11 });
});
