# Arquitetura — Snake Rush

Documento técnico da versão React (`src/`). Descreve o modelo de dados, o núcleo puro do jogo, o loop, a máquina de estados, a renderização em canvas, o áudio, o PWA e o caminho nativo.

> Versão documentada: **v2.1 — Next.js 16 (App Router), export estático e mecânica de habilidade**, 2026-10-27. A v1 (React + Vite) está preservada no histórico do Git e em `.backup/v1-2026-10-27/`.

---

## Visão geral

O jogo é dividido em quatro camadas:

| Camada | Arquivo | Responsabilidade |
| --- | --- | --- |
| Núcleo (puro) | `src/game/engine.ts` | Modelo `Game`, regras do passo, habilidade, corte, ritmo, sorteio dos recursos |
| Simulação + render | `src/components/SnakeGame.tsx` | Loop `requestAnimationFrame`, entrada, desenho no canvas, HUD e overlays |
| Áudio | `src/lib/sound.ts` | Síntese de efeitos com Web Audio API e preferência de mudo |
| Tátil | `src/lib/haptics.ts` | `@capacitor/haptics` quando nativo; `navigator.vibrate` como fallback |
| Apresentação | `src/app/globals.css` | Tema, HUD, overlays, d-pad, botão de turbo e responsividade |

Decisão central: **o estado da partida não vive no React**. Ele fica em um objeto mutável (`Game`) dentro de um `useRef`, atualizado a cada quadro e lido pelo loop. O React só re-renderiza o que a UI mostra: pontos, recorde, barra de carga, status e overlays. Isso evita dezenas de re-renders por segundo e mantém o passo do jogo independente do framerate.

O `engine.ts` não importa React nem toca no DOM — por isso é testável direto com `npm test` (`node --test`, sem runner extra).

---

## Fronteira servidor/cliente (Next.js)

O App Router renderiza tudo no servidor antes de hidratar, então o código é dividido pela necessidade de acesso ao navegador:

| Arquivo | Tipo | Por quê |
| --- | --- | --- |
| `src/app/layout.tsx` | server component | `<html>`/`<body>`, `metadata`, `viewport`, CSS global e `<PwaRegister />` |
| `src/app/page.tsx` | server component | Só monta `<SnakeGame />` |
| `src/app/manifest.ts` | server (estático) | Manifest do PWA; `export const dynamic = 'force-static'` é exigido por `output: 'export'` |
| `src/game/engine.ts` | módulo puro | Regras sem DOM — roda no servidor, no cliente e nos testes |
| `src/components/SnakeGame.tsx` | **client component** (`'use client'`) | Canvas, `requestAnimationFrame`, teclado, `window`, `localStorage` |
| `src/components/PwaRegister.tsx` | client component | Registra o service worker só em produção |
| `src/lib/sound.ts` | módulo do cliente | `AudioContext`; nunca executa no servidor |

Consequências que o código precisa respeitar:

1. **Nada de API do navegador durante o render.** `localStorage` e `AudioContext` são acessados em `useEffect` ou em handlers.
2. **Hidratação sem divergência.** `best` e `muted` começam em `0`/`false` no servidor e no primeiro render do cliente; o valor real entra em um `useEffect` de montagem.
3. **Estado aleatório não vai para o HTML.** O `Game` inicial usa `Math.random` (posição dos recursos) e é criado em `useRef` — só afeta o canvas.
4. **`reactStrictMode: true`** mantém o duplo-mount de desenvolvimento; os efeitos têm cleanup idempotente.

---

## Export estático

`next.config.ts` usa `output: 'export'` + `images: { unoptimized: true }`. O build gera `out/`, que é exatamente o que o Capacitor empacota (`webDir: 'out'`).

| Consequência | Detalhe |
| --- | --- |
| `next start` não serve mais o app | use `npm run preview` (servidor estático próprio, sem dependências) |
| Rotas precisam ser estáticas | o manifest declara `dynamic = 'force-static'` |
| Sem otimização de imagem | o projeto não usa `next/image`; a flag evita erro de build |
| Dev normal | `npm run dev` continua funcionando |

---

## Modelo de dados

```ts
type Cell = { x: number; y: number };
type Dir = { x: number; y: number };
type FoodKind = 'normal' | 'special';

interface Food {
  kind: FoodKind; // 'normal' = vermelho (1 célula); 'special' = laranja (2×2)
  cells: Cell[];
}

interface Game {
  snake: Cell[];          // corpo; índice 0 = cabeça
  prev: Cell[];           // posições do passo anterior (interpolação visual)
  dir: Dir;               // direção atual
  queue: Dir[];           // até 2 direções pendentes
  food: Food;
  spawns: number;         // recursos gerados (define a sequência 4 : 1)
  score: number;
  speed: number;          // ms por passo (diminui ao comer)
  acc: number;            // acumulador de tempo do loop
  deathAt: number;        // timestamp da morte (para o flash)
  charge: number;         // laranjas coletados no ciclo: 0 … ABILITY_THRESHOLD
  isAbilityActive: boolean;
  abilityTimer: number;   // ms restantes da habilidade
}
```

`prev` existe só para o desenho: cada segmento é interpolado de `prev[i]` até `snake[i]`, então o movimento parece contínuo. Depois de um corte a cobra fica mais curta; o desenho usa `prev[i] ?? seg`, então não há índice fora do lugar.

### Referências mutáveis do componente

| Ref | Conteúdo |
| --- | --- |
| `gameRef` | Objeto `Game` atual |
| `statusRef` | Status "de verdade" (o `useState` só espelha para a UI) |
| `boostRef` | Se o turbo está ativo (lido pelo loop, não pelo render) |
| `bestRef` | Recorde, para comparar sem depender do estado do React |
| `chargeRef` / `abilityRef` / `abilityPipsRef` | Último valor espelhado na UI, para só re-renderizar quando muda |
| `swipeRef` | Ponto inicial do arrasto no tabuleiro |

---

## Loop principal

Montado uma única vez (`useEffect` com dependências `[onEat, onCut, onAbility, syncMeta]`):

1. Configura o canvas para alta densidade: `dpr = max(1, devicePixelRatio)`, `canvas.width = W * dpr`, `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`.
2. A cada `requestAnimationFrame`, calcula `dt = min(now - last, 200)` — o teto evita um salto gigante quando a aba fica em segundo plano.
3. Se a habilidade está ativa, decrementa `abilityTimer` por `dt` e a encerra quando chega a zero (D6: só expira **no início do quadro seguinte**, então o passo de colisão do quadro atual ainda conta com ela).
4. Se o status é `running`, soma `dt` ao acumulador e executa passos enquanto `acc >= interval`.
5. `interval = stepInterval(g, boost)` — `speed` normal, `speed * 0.5` com turbo do Espaço ou `speed * 0.5` durante a habilidade, sem acúmulo (D3).
6. Um `guard` limita a 4 passos por quadro, impedindo espiral de morte se o navegador engasgar.
7. `t = min(acc / interval, 1)` é o fator de interpolação enviado ao desenho.
8. `syncMeta(g)` espelha no React apenas o que mudou (carga, modo e degraus da barra).
9. `draw(ctx, g, t, now)` roda **sempre** — a comida pulsa e o flash de morte aparece mesmo com o jogo parado.

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
| `running` | `over` | `step()` retorna `false` (parede ou corpo **sem** habilidade) |
| `over` | `running` | `start()` — botão **Jogar novamente** ou `Espaço` |

Cada transição dispara seu efeito sonoro (`sfx.start`, `sfx.pause`, `sfx.die`, `sfx.click`). Sair para o título e resetar zeram `score`, carga, habilidade e turbo, e recriam o `Game`.

---

## Regras (`step`)

1. **Fila de direções** — enquanto houver itens na fila, descarta os que seriam inversão de 180° e aplica o primeiro válido. A fila existe para não perder comandos rápidos entre dois passos.
2. **Nova cabeça** — `head = snake[0] + dir`.
3. **Parede** — fora de `COLS`/`ROWS` encerra a partida (`deathAt = performance.now()`, retorna `false`).
4. **Recurso** — `eat` é verdadeiro quando a cabeça entra em **qualquer** célula de `food.cells` (1 no vermelho, 4 no bloco laranja).
5. **Colisão com o corpo** — testa contra o corpo *sem a cauda* quando não come (a cauda sai da célula naquele passo) e contra o corpo inteiro quando come.
6. **Colisão com habilidade ativa** — em vez de morrer, a cobra **corta**: mantém a cabeça e o trecho anterior ao gomo atingido (`[head, ...snake.slice(0, hitIndex)]`), paga `20 × gomos cortados` e chama `onCut` (som + vibração + placar). A habilidade continua até o fim do quadro (D6) e não é estendida pelo corte.
7. **Movimento** — `prev` recebe o corpo antigo; o novo corpo é `[head, ...corpo]` + duplicação da cauda (crescimento) ou `[head, ...corpo sem a cauda]` sem comer.
8. **Comer** — pontos e gomos do tipo do recurso, `speed = max(MIN_SPEED, speed - SPEED_STEP)`, novo recurso sorteado, possível ativação da habilidade e `onEat(score, kind)`.

### Recursos: vermelho e laranja

| Recurso | Frequência | Células | Pontos | Gomos | Barra |
| --- | --- | --- | --- | --- | --- |
| Vermelho | 4 de cada 5 | 1 | 10 | +1 | não conta |
| Laranja | 1 de cada 5 | 4 (bloco 2×2) | 40 | +3 | +1 |

`placeFood` decide o tipo por `spawns % 5 === 4` e, para o laranja, sorteia um canto livre onde caibam as 4 células. Se não houver nenhum bloco 2×2 livre, o laranja cai para uma única célula livre (o `kind` continua `special`).

### Barra de laranjas e habilidade

| Situação | Efeito |
| --- | --- |
| Vermelho coletado | +10 pts, +1 gomo; **não** mexe na barra |
| Laranja coletado | +40 pts, +3 gomos, `charge += 1` |
| 5º laranja | ativa a habilidade **na hora** (`charge = 0`, `abilityTimer = 4000`) |
| Durante a habilidade | intervalo ×0.5; **crescimento ×3** (vermelho +3, laranja +9); encostar no corpo corta |
| Barra cheia durante o efeito | a próxima habilidade **emenda** quando a atual terminar |
| Fim dos 4 s | volta ao normal; morrer sem habilidade é derrota |

---

## Entrada

| Entrada | Tratamento |
| --- | --- |
| Setas / `W A S D` (maiúsc. e minúsc.) | `KEY_MAP` → `enqueue(dir)` |
| `Espaço` | `paused` → `resume`; fora de `running` → `start`; se `running` e não repetido → liga o turbo |
| Soltar `Espaço` | desliga o turbo |
| `Esc` | `running` → `pause`; `paused` → `resume` |
| `blur` da janela | desliga o turbo |
| D-pad na tela | `blur()` no botão + `enqueue(dir)` |
| Botão **⚡ Segure para turbo** | `pointerdown` liga; `pointerup`/`pointercancel`/`pointerleave` desligam |
| Arrasto no tabuleiro | acima de 24 px vale o eixo dominante; abaixo disso é tratado como toque |

`enqueue` só aceita comandos com status `running`, ignora a inversão de 180°, ignora repetição da última direção e mantém no máximo 2 itens na fila.

---

## Renderização

Tudo é desenhado a cada quadro, nesta ordem:

1. **Fundo** — gradiente linear diagonal (`#111a3f` → `#161247` → `#221449`).
2. **Grade** — pontos de `2×2` px a cada célula, com `rgba(255,255,255,0.05)`.
3. **Recurso** — vermelho (1 célula): círculo com gradiente radial, `shadowBlur: 18` e pulso `1 + sin(now / 180) * 0.1`. Laranja (bloco 2×2): quadrados arredondados com gradiente `#fed7aa → #fb923c → #ea580c`, `shadowBlur: 20` e um núcleo claro pulsante no centro do bloco.
4. **Cobra** — percorrida **da cauda para a cabeça** (a cabeça fica por cima). Cada segmento:
   - posição interpolada `prev[i] → snake[i]` por `t`;
   - matiz `hue = 160 + k * 120` (`k = i / (n - 1)`), verde na cabeça e roxo na cauda;
   - cantos arredondados (`roundRect` nativo, com fallback via `arcTo`);
   - cabeça levemente maior (`CELL - 2` contra `CELL - 4`), com brilho e olhos por `drawEyes`.
5. **Flash de morte** — véu vermelho com alfa decaindo em 600 ms a partir de `deathAt`.

O HUD, o overlay e a borda de estado do tabuleiro são HTML/CSS sobre o canvas (`position: absolute`). A borda muda de cor: **laranja** durante a habilidade, **amarela** no turbo do Espaço, neutra no resto.

---

## Áudio

`src/lib/sound.ts` sintetiza tudo com osciladores — nenhum arquivo de áudio é carregado.

- `getCtx()` cria/reaproveita um `AudioContext` (com fallback `webkitAudioContext`) e o retoma se estiver suspenso; retorna `null` quando o som está mudo, quando não há `window` (SSR) ou quando a API não existe.
- `tone()` agenda um oscilador com envelope de ganho (ataque de 12 ms, decaimento até `0.0001`) e desconecta os nós no `onended`.
- Efeitos: `eat` (blip ascendente duplo), `die` (queda grave em serra), `start` (arpejo de três notas), `pause` (descida suave), `cut` (corte com bônus), `ability` (ativação), `click`.
- `isMuted` / `setMuted` / `toggleMuted` persistem a preferência em `localStorage.snakeMuted`.

---

## Tátil

`src/lib/haptics.ts` expõe `haptic('light' | 'medium')`:

1. tenta `@capacitor/core` + `@capacitor/haptics` (imports dinâmicos, só carregam em app nativo);
2. se não houver plataforma nativa, usa `navigator.vibrate(15 | 40)` quando existir;
3. iOS Safari não expõe a API — fica silencioso, sem erro.

Chamado em `onCut` (`medium`) e `onAbility` (`light`).

---

## Constantes de ajuste

Regras e ritmo em `src/game/engine.ts`; chave de persistência no componente.

| Constante | Valor | Efeito |
| --- | --- | --- |
| `COLS` / `ROWS` | `20` / `20` | Tamanho do tabuleiro em células |
| `CELL` | `20` | Tamanho da célula em px (canvas `400×400`) |
| `BASE_SPEED` | `130` | Intervalo inicial entre passos (ms) |
| `MIN_SPEED` | `70` | Intervalo mínimo, ou seja, velocidade máxima |
| `SPEED_STEP` | `3` | Quanto o intervalo cai por recurso comido |
| `BOOST_FACTOR` | `0.5` | Multiplicador do intervalo no turbo |
| `SPECIAL_EVERY` | `5` | 1 recurso laranja a cada 5 gerados (4 vermelhos : 1 laranja) |
| `ABILITY_THRESHOLD` | `5` | Laranjas coletados para ativar a habilidade |
| `ABILITY_DURATION_MS` | `4000` | Duração da habilidade (4 s) |
| `ABILITY_SPEED_FACTOR` | `0.5` | Multiplicador do intervalo durante a habilidade (não acumula com o turbo) |
| `ABILITY_GROWTH_FACTOR` | `3` | Crescimento ×3 durante a habilidade |
| `CUT_BONUS_PER_SEGMENT` | `20` | Pontos por gomo cortado |
| `POINTS_NORMAL` / `POINTS_SPECIAL` | `10` / `40` | Pontos por recurso vermelho / bloco laranja |
| `GROWTH_NORMAL` / `GROWTH_SPECIAL` | `1` / `3` | Gomos por recurso vermelho / bloco laranja |
| `BEST_KEY` | `snakeBest` | Chave do recorde no `localStorage` |

---

## Persistência

| Chave | Escrita | Leitura |
| --- | --- | --- |
| `snakeBest` | Ao superar o recorde, durante a partida | Inicialização (`bestRef`) |
| `snakeMuted` | Ao alternar o botão de som | Inicialização do módulo `sound.ts` |

Todas as chamadas são protegidas por `try/catch`: sem `localStorage` o jogo roda normalmente, apenas sem persistir.

---

## Testes

`src/game/engine.test.ts` cobre as regras sem navegador:

```bash
npm test   # node --test "src/**/*.test.ts"
```

Casos: sequência 4 vermelhos : 1 laranja, bloco laranja 2×2 (limites e células livres) com fallback de 1 célula, vermelho fora da barra e ativação no 5º laranja, pontuação 10/40, crescimento 1/4 e ×3 durante a habilidade, coleta do bloco por qualquer célula, aceleração até o mínimo, `stepInterval` (turbo ×0.5 e sem acúmulo com a habilidade), morte por parede e por corpo, corte com bônus, contagem da barra (`abilityPips`), emenda/saída da habilidade (`advanceAbility`) e descarte de inversão de 180°.

---

## PWA e empacotamento nativo

| Arquivo | Função |
| --- | --- |
| `src/app/manifest.ts` | `/manifest.webmanifest`: `standalone`, `portrait`, cores do tema |
| `public/sw.js` | Service worker: network-first na navegação, cache-first em `/_next/static`, SWR no resto |
| `public/offline.html` | Fallback sem rede |
| `src/components/PwaRegister.tsx` | Registra o SW só em produção |
| `capacitor.config.ts` | `appId`, `appName`, `webDir: 'out'` |

Detalhes de instalação, comandos do Capacitor e o que roda em qual máquina estão em [`nativo.md`](./nativo.md).

---

## Pontos de extensão

- **Outros formatos de recurso especial**: `Food.cells` aceita qualquer conjunto de células; a geração está isolada em `placeFood`.
- **Obstáculos ou níveis**: lista de células bloqueadas consultada nos testes de colisão e em `placeFood`.
- **Bordas com wrap**: trocar o teste de parede por aritmética modular — atenção à interpolação em `prev`.
- **Pausa automática ao perder foco**: o handler de `blur` já existe; hoje ele só desliga o turbo.
- **Volume geral**: parâmetro em `tone()` multiplicando o `volume` de cada efeito.
- **Modos de dificuldade** com recordes separados.

## Limitações conhecidas

- **Sem vitória**: se a cobra preencher o tabuleiro, `placeFood` posiciona o recurso em `{0, 0}`.
- **Sem wrap de bordas**: encostar na parede encerra a partida.
- **Recorde único**: não há separação por modo ou dificuldade.
- **Sem build nativo publicado**: o Capacitor está configurado, mas `android/` e `ios/` ainda não existem (E4-03/E4-04 do backlog).
- **Service worker só em produção**: em `npm run dev` não há cache nem modo offline.
- **`public/snake.html` legado**: a versão em HTML único não tem pausa, turbo, habilidade nem som.
