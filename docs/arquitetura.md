# Arquitetura — Jogo da Cobrinha

Documento técnico da versão React (`src/`). Descreve o modelo de dados, o loop de jogo, a máquina de estados, a renderização em canvas, o áudio e os pontos de extensão.

> Versão documentada: **v2.0.0 — Next.js 16 (App Router)**, migração de 2026-10-27. A v1 (React + Vite) está preservada no histórico do Git e nas páginas de snapshot.

---

## Visão geral

O jogo é dividido em três camadas:

| Camada | Arquivo | Responsabilidade |
| --- | --- | --- |
| Simulação + render | `src/components/SnakeGame.tsx` | Estado da partida, regras, loop e desenho no canvas |
| Áudio | `src/lib/sound.ts` | Síntese de efeitos com Web Audio API e preferência de mudo |
| Apresentação | `src/app/globals.css` | Tema, HUD, overlays, d-pad e responsividade |

Decisão central: **o estado da partida não vive no React**. Ele fica em um objeto mutável (`Game`) dentro de um `useRef`, atualizado a cada quadro e lido pelo loop de `requestAnimationFrame`. O React é usado apenas para o que precisa re-renderizar: HUD (pontos, recorde, barra de velocidade), status e overlays. Isso evita dezenas de re-renders por segundo e mantém o passo do jogo independente do framerate.

---

## Fronteira servidor/cliente (Next.js)

O App Router renderiza tudo no servidor antes de hidratar no navegador, então o código foi dividido pela necessidade de acesso ao navegador:

| Arquivo | Tipo | Por quê |
| --- | --- | --- |
| `src/app/layout.tsx` | server component | `<html>`/`<body>`, `metadata`, `viewport` e import do CSS global |
| `src/app/page.tsx` | server component | Só monta `<SnakeGame />` |
| `src/components/SnakeGame.tsx` | **client component** (`'use client'`) | Canvas, `requestAnimationFrame`, teclado, `window`, `localStorage` |
| `src/lib/sound.ts` | módulo do cliente | `AudioContext`; nunca executa no servidor |

Consequências que o código precisa respeitar:

1. **Nada de API do navegador durante o render.** `localStorage` e `AudioContext` são acessados em `useEffect` ou dentro de handlers, nunca no corpo do componente.
2. **Hidratação sem divergência.** `best` e `muted` começam em `0`/`false` no servidor e no primeiro render do cliente; o valor real do `localStorage` entra em um `useEffect` de montagem. Se fossem lidos no `useState` inicial, o HTML do servidor (`0`) divergiria do cliente (`42`) e o React acusaria erro de hidratação.
3. **Estado aleatório não vai para o HTML.** O `Game` inicial usa `Math.random` (posição da fruta) e é criado em `useRef` — como só afeta o canvas, não há diferença visível no markup.
4. **`reactStrictMode: true`** em `next.config.ts` mantém o duplo-mount de desenvolvimento; todos os efeitos do jogo têm cleanup idempotente (o loop cancela o `requestAnimationFrame`, a leitura do storage é read-only).

---

## Modelo de dados

```ts
type Cell = { x: number; y: number };
type Dir = { x: number; y: number };
type Status = 'idle' | 'running' | 'paused' | 'over';

interface Game {
  snake: Cell[];   // corpo; índice 0 = cabeça
  prev: Cell[];    // posições do passo anterior (interpolação visual)
  dir: Dir;        // direção atual
  queue: Dir[];    // até 2 direções pendentes
  food: Cell;
  score: number;
  speed: number;   // ms por passo (diminui ao comer)
  acc: number;     // acumulador de tempo do loop
  deathAt: number; // timestamp da morte (para o flash)
}
```

`prev` existe só para o desenho: cada segmento é interpolado de `prev[i]` até `snake[i]`, então o movimento parece contínuo mesmo com passos discretos.

### Referências mutáveis do componente

| Ref | Conteúdo |
| --- | --- |
| `gameRef` | Objeto `Game` atual |
| `statusRef` | Status "de verdade" (o `useState` só espelha para a UI) |
| `boostRef` | Se o turbo está ativo (lido pelo loop, não pelo render) |
| `bestRef` | Recorde, para comparar sem depender do estado do React |

O loop lê `statusRef`/`boostRef`; por isso teclado e render nunca ficam defasados por um render atrasado.

---

## Loop principal

Montado uma única vez (`useEffect` com dependência `[onEat]`):

1. Configura o canvas para alta densidade: `dpr = max(1, devicePixelRatio)`, `canvas.width = W * dpr`, `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`.
2. A cada `requestAnimationFrame`, calcula `dt = min(now - last, 200)` — o teto de 200 ms evita um salto gigante quando a aba fica em segundo plano.
3. Se o status é `running`, soma `dt` ao acumulador e executa passos enquanto `acc >= interval`.
4. `interval` é recalculado a cada passo: `boost ? speed * BOOST_FACTOR : speed`.
5. Um `guard` limita a 4 passos por quadro, impedindo espiral de morte se o navegador engasgar.
6. `t = min(acc / interval, 1)` é o fator de interpolação enviado ao desenho.
7. `draw(ctx, g, t, now)` roda **sempre**, em qualquer status — por isso a comida continua pulsando e o flash de morte aparece mesmo com o jogo parado.

O loop é cancelado no unmount (`cancelAnimationFrame`).

---

## Máquina de estados

O status é `idle | running | paused | over`, espelhado em `statusRef` (lógica) e `status` (UI).

| De | Para | Gatilho |
| --- | --- | --- |
| `idle` | `running` | `start()` — botão **Iniciar** ou `Espaço` |
| `running` | `paused` | `pause()` — `Esc` |
| `paused` | `running` | `resume()` — `Esc`, `Espaço` ou botão **Resumir** |
| `paused` | `running` | `start()` — botão **Resetar estágio** (recomeça do zero) |
| `paused` | `idle` | `exitToTitle()` — botão **Sair do jogo** |
| `running` | `over` | `step()` retorna `false` (parede ou corpo) |
| `over` | `running` | `start()` — botão **Jogar novamente** ou `Espaço` |

Cada transição dispara seu efeito sonoro (`sfx.start`, `sfx.pause`, `sfx.die`, `sfx.click`). Sair para o título e resetar também zeram `score`, `speed`, turbo e recriam o `Game`.

---

## Regras (`step`)

1. **Fila de direções** — enquanto houver itens na fila, descarta os que seriam inversão de 180° em relação à direção atual e aplica o primeiro válido. A fila existe para não perder comandos rápidos entre dois passos.
2. **Nova cabeça** — `head = snake[0] + dir`.
3. **Parede** — fora dos limites de `COLS`/`ROWS` encerra a partida (`deathAt = performance.now()`, retorna `false`).
4. **Colisão com o corpo** — testa contra o corpo *sem a cauda* quando não come (a cauda sai da célula naquele passo) e contra o corpo inteiro quando come.
5. **Movimento** — `prev` recebe o corpo antigo; o novo corpo é `[head, ...corpo]` comendo ou `[head, ...corpo sem a cauda]` sem comer.
6. **Comer** — `+10` pontos, `speed = max(MIN_SPEED, speed - SPEED_STEP)`, nova fruta sorteada, e o callback `onEat` atualiza React, recorde e toca o som.

`placeFood` monta a lista de células livres e sorteia uma; se o tabuleiro estiver cheio, cai no canto `{0, 0}` (situação de vitória não tratada — ver Limitações).

---

## Entrada

| Entrada | Tratamento |
| --- | --- |
| Setas / `W A S D` (maiúsc. e minúsc.) | `KEY_MAP` → `enqueue(dir)` |
| `Espaço` | `paused` → `resume`; senão, fora de `running` → `start`; se `running` e não repetido → liga o turbo |
| Soltar `Espaço` | desliga o turbo |
| `Esc` | `running` → `pause`; `paused` → `resume` |
| `blur` da janela | desliga o turbo (evita ficar acelerado ao trocar de aba) |
| D-pad na tela | `blur()` no botão + `enqueue(dir)` |

`enqueue` só aceita comandos com status `running`, ignora a inversão de 180°, ignora repetição da última direção e mantém no máximo 2 itens na fila.

---

## Renderização

Tudo é desenhado a cada quadro, nesta ordem:

1. **Fundo** — gradiente linear diagonal (`#111a3f` → `#161247` → `#221449`).
2. **Grade** — pontos de `2×2` px a cada célula, com `rgba(255,255,255,0.05)`.
3. **Comida** — círculo com gradiente radial, `shadowBlur: 18` e pulso `1 + sin(now / 180) * 0.1`.
4. **Cobra** — percorrida **da cauda para a cabeça** (a cabeça fica por cima). Cada segmento:
   - posição interpolada `prev[i] → snake[i]` por `t`;
   - matiz `hue = 160 + k * 120` (`k = i / (n - 1)`), ou seja, verde na cabeça e roxo na cauda, com luminosidade caindo ao longo do corpo;
   - cantos arredondados (`roundRect` nativo, com fallback manual via `arcTo` para navegadores antigos);
   - cabeça levemente maior (`CELL - 2` contra `CELL - 4`), com brilho e olhos posicionados por `drawEyes` conforme a direção.
5. **Flash de morte** — véu vermelho com alfa decaindo em 600 ms a partir de `deathAt`.

O HUD, o overlay e o indicador de turbo são HTML/CSS por cima do canvas (`position: absolute`), não fazem parte do desenho.

---

## Áudio

`src/lib/sound.ts` sintetiza tudo com osciladores — nenhum arquivo de áudio é carregado. O módulo é importado só pelo client component, então nunca é executado no servidor.

- `getCtx()` cria/reaproveita um `AudioContext` (com fallback `webkitAudioContext`) e o retoma se estiver suspenso; retorna `null` quando o som está mudo, quando não há `window` (SSR) ou quando a API não existe.
- `tone()` agenda um oscilador com envelope de ganho (ataque de 12 ms, decaimento até `0.0001`) e desconecta os nós no `onended`, evitando vazamento.
- Efeitos: `eat` (blip ascendente duplo), `die` (queda grave em serra), `start` (arpejo de três notas), `pause` (descida suave), `click`.
- `isMuted` / `setMuted` / `toggleMuted` persistem a preferência em `localStorage.snakeMuted`.

---

## Constantes de ajuste

Todas no topo de `src/components/SnakeGame.tsx`:

| Constante | Valor | Efeito |
| --- | --- | --- |
| `COLS` / `ROWS` | `20` / `20` | Tamanho do tabuleiro em células |
| `CELL` | `20` | Tamanho da célula em px (canvas `400×400`) |
| `BASE_SPEED` | `130` | Intervalo inicial entre passos (ms) |
| `MIN_SPEED` | `70` | Intervalo mínimo, ou seja, velocidade máxima |
| `SPEED_STEP` | `3` | Quanto o intervalo cai por fruta comida |
| `BOOST_FACTOR` | `0.5` | Multiplicador do intervalo no turbo |
| `BEST_KEY` | `snakeBest` | Chave do recorde no `localStorage` |

Ajustes que mudam a sensação do jogo sem tocar em lógica: `BASE_SPEED` (ritmo inicial), `MIN_SPEED` (teto de dificuldade), `SPEED_STEP` (curva de aceleração) e `BOOST_FACTOR` (intensidade do turbo).

---

## Persistência

| Chave | Escrita | Leitura |
| --- | --- | --- |
| `snakeBest` | Ao superar o recorde, durante a partida | Inicialização (`bestRef`) |
| `snakeMuted` | Ao alternar o botão de som | Inicialização do módulo `sound.ts` |

Todas as chamadas são protegidas por `try/catch`: sem `localStorage` o jogo roda normalmente, apenas sem persistir.

---

## Pontos de extensão

Ideias que cabem na arquitetura atual sem refatoração relevante:

- **Comida especial** (bônus com tempo limitado): um segundo campo em `Game` + ramo em `step()` e um desenho extra.
- **Obstáculos ou níveis**: lista de células bloqueadas consultada nos testes de colisão e em `placeFood`.
- **Bordas com wrap**: trocar o teste de parede por aritmética modular — atenção à interpolação em `prev`, que precisaria tratar o salto.
- **Swipe em touch**: adicionar `touchstart`/`touchend` chamando `enqueue`, reaproveitando o d-pad em telas pequenas.
- **Pausa automática ao perder foco**: o handler de `blur` já existe; hoje ele só desliga o turbo.
- **Volume geral**: parâmetro em `tone()` multiplicando o `volume` de cada efeito.

## Limitações conhecidas

- **Sem vitória**: se a cobra preencher o tabuleiro, `placeFood` posiciona a fruta em `{0, 0}` em vez de encerrar com vitória.
- **Sem swipe**: em telas de toque, o controle é pelo d-pad.
- **Sem wrap de bordas**: encostar na parede encerra a partida.
- **`public/snake.html` legado**: a versão em HTML único (servida em `/snake.html`) não tem pausa, turbo nem som, e não recebe as melhorias da versão React.
- **Recorde único**: não há separação por modo ou dificuldade.
