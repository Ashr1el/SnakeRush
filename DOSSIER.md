# Dossiê do projeto — SnakeRush

> Documento único de especificação. Consolida README, `docs/` e o código-fonte em um só lugar.
> **Versão documentada:** v2.0.0 (Next.js 16) + mecânica D1–D8 (branch `feat/habilidade-e-mobile`) · **Branches:** `developer`, `feat/habilidade-e-mobile` · **Última revisão:** 2026-10-27

---

## 1. Identidade

| Item | Valor |
| --- | --- |
| Nome | Jogo da Cobrinha (SnakeRush) |
| Tipo | Jogo web single-player, 100% client-side |
| Repositório | https://github.com/Ashr1el/SnakeRush |
| Branch de trabalho | `developer` (também a padrão) |
| Produção | https://snake-rush-delta.vercel.app |
| Projeto Vercel | `oc-ara/snake-rush` |
| Idioma da interface | pt-BR (`<html lang="pt-BR">`) |
| Versão do app | `2.0.0` (`package.json`) |
| Público | Desktop e mobile (teclado + d-pad na tela) |

### Proposta

Recriar o clássico jogo da cobrinha com acabamento moderno: movimento interpolado (sem "saltos" de célula), efeitos sonoros sintetizados em tempo real, tema visual neon e uma máquina de estados completa (título → jogo → pausa → fim), sem backend e sem dependências de UI.

---

## 2. Stack e dependências

| Item | Faixa (`package.json`) | Instalado |
| --- | --- | --- |
| Next.js | `^16.4.3` | 16.4.3 |
| React / React DOM | `^19.3.1` | 19.3.1 |
| TypeScript | `^5.6.3` | 5.9.3 |
| `@types/node` | `^24.10.1` | 24.19.2 |
| `@types/react` | `^19.2.2` | — |
| `@types/react-dom` | `^19.2.2` | — |
| Node.js (exigência) | `>=20.9.0` | — |

**Sem** bibliotecas de UI, de estado, de animação ou de áudio. Tudo que não é React/Next usa APIs nativas do navegador:

- **Canvas 2D** — desenho do tabuleiro, cobra e comida.
- **`requestAnimationFrame`** — loop do jogo.
- **Web Audio API** — síntese dos efeitos sonoros.
- **`localStorage`** — recorde e preferência de som.

Build padrão do Next (Turbopack no 16). Versões exatas ficam travadas em `package-lock.json`.

---

## 3. Requisitos e scripts

**Ambiente:** Node.js 20.9+ e npm.

| Script | Comando | Função |
| --- | --- | --- |
| `dev` | `next dev` | Servidor de desenvolvimento em `http://localhost:3000` |
| `build` | `next build` | Build de produção em `.next/` (inclui typecheck) |
| `start` | `next start` | Serve o build de produção |
| `typecheck` | `tsc --noEmit` | Apenas verificação de tipos |

O `next build` falha com qualquer erro de TypeScript, então o build já valida os tipos.

### Configuração de compilação

- `next.config.ts`: apenas `reactStrictMode: true` (mantém o duplo-mount em desenvolvimento; todos os efeitos têm cleanup idempotente).
- `tsconfig.json`: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noEmit`, `moduleResolution: "bundler"`, `jsx: "react-jsx"`, alias `@/* → ./src/*`, exclusão de `node_modules` e `.backup`.

---

## 4. Estrutura de arquivos

```
.
├── AGENTS.md                    # regras para agentes (deploy só on demand)
├── DOSSIER.md                   # este documento
├── README.md                    # visão geral e guia rápido
├── next.config.ts               # React Strict Mode
├── package.json                 # scripts e dependências
├── tsconfig.json                # TS estrito + alias @/*
├── .gitignore                   # node_modules, .next, .env*, .vercel, .backup
├── .env.local                   # gerado pelo Vercel CLI (NÃO versionado)
├── .vercel/                     # link local do projeto na Vercel (NÃO versionado)
├── .backup/v1-2026-10-27/       # cópia byte a byte da v1 em Vite (NÃO versionado)
├── public/
│   └── snake.html               # versão legada em HTML único (/snake.html)
├── src/
│   ├── app/
│   │   ├── layout.tsx           # <html>/<body>, metadata, viewport, CSS global
│   │   ├── page.tsx             # rota "/" — monta <SnakeGame />
│   │   └── globals.css          # tema, HUD, tabuleiro, overlays, d-pad, responsivo
│   ├── components/
│   │   └── SnakeGame.tsx        # client component: estado, loop, regras, render, HUD
│   └── lib/
│       └── sound.ts             # efeitos sonoros (Web Audio) + mute persistido
└── docs/
    ├── arquitetura.md           # modelo de dados, loop, estados, render, áudio
    └── restauracao-e-snapshots.md # rollback (git, backup local, ai-memory)
```

---

## 5. Fronteira servidor/cliente (Next.js App Router)

| Arquivo | Tipo | Responsabilidade / por quê |
| --- | --- | --- |
| `src/app/layout.tsx` | server component | `<html>`/`<body>`, `metadata`, `viewport`, import do CSS global |
| `src/app/page.tsx` | server component | Só monta `<SnakeGame />` |
| `src/components/SnakeGame.tsx` | **client component** (`'use client'`) | Canvas, RAF, teclado, `window`, `localStorage` |
| `src/lib/sound.ts` | módulo de cliente | `AudioContext`; nunca roda no servidor |

### Regras obrigatórias decorrentes

1. **Nenhuma API de navegador no render.** `localStorage` e `AudioContext` só em `useEffect` ou em handlers.
2. **Hidratação sem divergência.** `best` e `muted` começam em `0`/`false` no servidor e no primeiro render do cliente; o valor real do storage entra em `useEffect` de montagem.
3. **Aleatoriedade fora do HTML.** O `Game` inicial (fruta sorteada) vive em `useRef` e só afeta o canvas.
4. **`reactStrictMode: true`** — efeitos precisam ser idempotentes e com cleanup (o loop cancela o RAF; leitura de storage é read-only).

### Metadados da página (`layout.tsx`)

| Campo | Valor |
| --- | --- |
| `title` | `Jogo da Cobrinha` |
| `description` | `Jogo da cobrinha em React e Next.js: movimento suave no canvas, turbo, pausa e efeitos sonoros sintetizados.` |
| `applicationName` | `Jogo da Cobrinha` |
| `themeColor` | `#0a0f27` |
| `viewport` | `width=device-width`, `initialScale: 1` |

---

## 6. Modelo de dados

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
  deathAt: number; // timestamp da morte (flash)
  foodCount: number;        // carga da barra de habilidade (0 a 5)
  isAbilityActive: boolean; // modo especial: turbo + auto-corte
  abilityTimer: number;     // ms restantes da habilidade
}
```

`prev` existe apenas para o desenho: cada segmento é interpolado de `prev[i]` até `snake[i]`.

### Referências mutáveis (`useRef`)

| Ref | Conteúdo |
| --- | --- |
| `gameRef` | Objeto `Game` atual |
| `statusRef` | Status real (o `useState` só espelha para a UI) |
| `boostRef` | Turbo ativo, lido pelo loop |
| `bestRef` | Recorde, para comparar sem depender do render |

### Estado React (`useState`)

`status`, `score`, `best`, `boost`, `muted`, `charge`, `ability` — usados **apenas** para HUD e overlays.

**Decisão central:** o estado da partida **não** vive no React. Ele fica no `Game` mutável dentro de `useRef`, atualizado a cada quadro. React renderiza só o que muda de forma perceptível (pontos, recorde, status, turbo), evitando dezenas de re-renders por segundo.

---

## 7. Constantes de ajuste

Todas no topo de `src/components/SnakeGame.tsx`:

| Constante | Valor | Efeito |
| --- | --- | --- |
| `COLS` / `ROWS` | `20` / `20` | Tabuleiro em células |
| `CELL` | `20` | px por célula (canvas lógico `400×400`) |
| `BASE_SPEED` | `130` | Intervalo inicial entre passos (ms) |
| `MIN_SPEED` | `70` | Intervalo mínimo (velocidade máxima) |
| `SPEED_STEP` | `3` | Quanto o intervalo cai por fruta |
| `BOOST_FACTOR` | `0.5` | Multiplicador do intervalo durante o turbo |
| `ABILITY_THRESHOLD` | `5` | Frutas para encher a barra de carga |
| `ABILITY_DURATION_MS` | `2000` | Duração da habilidade especial (2 s) |
| `ABILITY_SPEED_FACTOR` | `0.5` | Multiplicador do intervalo durante a habilidade |
| `CUT_BONUS_PER_SEGMENT` | `20` | Bônus por segmento cortado (200% de 10) |
| `BEST_KEY` | `"snakeBest"` | Chave do recorde no `localStorage` |

Ajustes de "sensação" sem tocar em lógica: `BASE_SPEED`, `MIN_SPEED`, `SPEED_STEP`, `BOOST_FACTOR`.

---

## 8. Regras do jogo

- Cada fruta vale **10 pontos** e faz a cobra crescer um segmento.
- Cada fruta reduz o intervalo entre passos em **3 ms**, até o piso de **70 ms**.
- A fruta sempre nasce em uma célula livre (`placeFood` sorteia entre as livres).
- Bater na parede encerra a partida — **não há wrap** de bordas. Colidir com o próprio corpo também encerra, **exceto** durante a habilidade (auto-corte).
- O recorde é atualizado durante a partida e exibido no HUD.
- Não há condição de vitória: tabuleiro cheio → fruta cai em `{0,0}`.

### Barra de carga e habilidade especial (D1–D8)

| Regra | Comportamento |
| --- | --- |
| Carga | Cada fruta soma **1** em `foodCount`, até **5** (barra cheia na 5ª fruta) |
| Ativação | A recolha **seguinte** (6ª do ciclo) ativa a habilidade e zera `foodCount` |
| Duração | `2000` ms de jogo; a pausa **não** consome o tempo |
| Velocidade | Intervalo entre passos `×0.5` (`ABILITY_SPEED_FACTOR`); **não** acumula com o turbo do `Espaço` |
| Expiração | Só no início do quadro seguinte (`D6`) — vale até o fim do quadro corrente |
| Auto-corte | Colisão com o corpo durante a habilidade **não** mata: mantém a cabeça + o trecho anterior ao gomo atingido |
| Bônus | `20` pontos por segmento cortado (`CUT_BONUS_PER_SEGMENT`), somados ao placar e ao recorde |
| Sem habilidade | Colisão com o corpo segue sendo derrota |

Detalhe de implementação: a colisão é detectada **antes** de a nova cabeça entrar no corpo, então `hitIndex` é o índice do gomo atingido no corpo atual; a cobra vira `[head, ...snake.slice(0, hitIndex)]` e o total cortado é `snake.length - hitIndex`.

### Passo da simulação (`step`)

1. **Fila de direções** — descarta inversões de 180° em relação à direção atual e aplica a primeira válida (a fila evita perder comandos rápidos entre passos).
2. **Nova cabeça** — `head = snake[0] + dir`.
3. **Parede** — fora de `COLS`/`ROWS` → `deathAt = performance.now()` e retorna `false`.
4. **Colisão com o corpo** — testa o corpo **sem a cauda** quando não come (a cauda deixa a célula naquele passo) e o corpo inteiro quando come.
5. **Movimento** — `prev = corpo antigo`; novo corpo = `[head, ...corpo]` (comeu) ou `[head, ...corpo sem cauda]`.
6. **Comer** — `+10` pontos, `speed = max(MIN_SPEED, speed - SPEED_STEP)`, nova fruta e callback `onEat` (React + recorde + som).

---

## 9. Máquina de estados

Status: `idle | running | paused | over`, espelhado em `statusRef` (lógica) e `status` (UI).

| De | Para | Gatilho |
| --- | --- | --- |
| `idle` | `running` | `start()` — botão **Iniciar** ou `Espaço` |
| `running` | `paused` | `pause()` — `Esc` |
| `paused` | `running` | `resume()` — `Esc`, `Espaço` ou botão **Resumir** |
| `paused` | `running` | `start()` — **Resetar estágio** (recomeça do zero) |
| `paused` | `idle` | `exitToTitle()` — **Sair do jogo** |
| `running` | `over` | `step()` retorna `false` (parede ou corpo) |
| `over` | `running` | `start()` — **Jogar novamente** ou `Espaço` |

Cada transição dispara seu som (`start`, `pause`, `die`, `click`). Reset e saída zeram `score`, `speed`, turbo e recriam o `Game`.

---

## 10. Loop principal

Montado uma única vez (`useEffect` com dependência `[onEat]`):

1. **DPR-aware:** `dpr = max(1, devicePixelRatio)`; `canvas.width = W * dpr`, `canvas.height = H * dpr`; `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`.
2. A cada quadro: `dt = min(now - last, 200)` — o teto de 200 ms evita salto gigante após a aba ficar em segundo plano.
3. Se `running`: soma `dt` ao acumulador e executa passos enquanto `acc >= interval`.
4. `interval = boost ? speed * BOOST_FACTOR : speed`, recalculado a cada passo.
5. `guard` limita a **4 passos por quadro** (evita espiral de morte se o navegador engasgar).
6. `t = min(acc / interval, 1)` é o fator de interpolação enviado ao desenho.
7. `draw(ctx, g, t, now)` roda **sempre**, em qualquer status — comida continua pulsando e o flash de morte aparece com o jogo parado.

Cleanup: `cancelAnimationFrame` no unmount.

---

## 11. Entrada (controles)

| Ação | Teclado | Tela |
| --- | --- | --- |
| Mover | Setas ou `W A S D` (maiúsc./minúsc.) | d-pad (↑ ← ↓ →) |
| Iniciar / jogar novamente | `Espaço` | botão **Iniciar** |
| Turbo (acelerar) | segurar `Espaço` durante o jogo | — |
| Pausar / retomar | `Esc` | menu de pausa |
| Resumir / Reiniciar / Sair | — | botões do menu de pausa |
| Ativar/desativar som | — | botão 🔇/🔊 |

Regras de entrada:

- `Espaço`: em `paused` → `resume`; fora de `running` → `start`; em `running` (sem auto-repeat) → liga o turbo.
- Soltar `Espaço` **ou** `blur` da janela → turbo desligado (evita seguir acelerado em outra aba).
- `enqueue` só aceita comandos com status `running`, ignora inversão de 180°, ignora repetição da última direção e mantém no máximo **2** itens na fila.
- D-pad chama `blur()` no botão antes de enfileirar (evita reacionar `Espaço`/`Enter`).

---

## 12. Renderização

Ordem de desenho a cada quadro:

1. **Fundo** — gradiente linear diagonal `#111a3f → #161247 → #221449`.
2. **Grade** — pontos `2×2` px por célula, `rgba(255,255,255,0.05)`.
3. **Comida** — círculo em gradiente radial, `shadowBlur: 18`, pulso `1 + sin(now/180) * 0.1`, cores `#ffd6e0 / #ff6b8a / #e94560`.
4. **Cobra** — percorrida **da cauda para a cabeça** (cabeça por cima). Por segmento:
   - posição interpolada `prev[i] → snake[i]` por `t`;
   - matiz `hue = 160 + k * 120` (`k = i / (n-1)`): verde na cabeça, roxo na cauda, luminosidade caindo;
   - cantos arredondados (`roundRect` nativo com fallback `arcTo`);
   - cabeça maior (`CELL - 2` vs `CELL - 4`), com brilho e olhos via `drawEyes` orientados pela direção.
5. **Flash de morte** — véu vermelho com alfa decaindo em 600 ms a partir de `deathAt`.

HUD, overlays e o indicador de turbo são **HTML/CSS** sobre o canvas (`position: absolute`), não fazem parte do desenho.

---

## 13. Interface e tema (HTML/CSS)

### Tokens de cor (`:root`)

| Token | Valor | Uso |
| --- | --- | --- |
| `--cyan` | `#22d3ee` | Pontos, moldura, botões primários |
| `--lime` | `#a3e635` | Gradientes e botões primários |
| `--pink` | `#f472b6` | Recorde, botões secundários |
| `--violet` | `#a78bfa` | Botões secundários e d-pad |
| `--amber` | `#fbbf24` | Destaques/recorde, borda no turbo |
| `--panel` | `rgba(255,255,255,0.06)` | Fundo de cards e botão de som |
| `--panel-border` | `rgba(255,255,255,0.12)` | Bordas de cards |
| `--text` | `#eef2ff` | Texto principal |
| `--muted` | `#9aa6d2` | Texto secundário |

Fundo do `body`: três gradientes radiais (ciano, rosa, violeta) sobre `linear-gradient(160deg, #0a0f27, #14103a, #1d1247)`.

### Componentes visuais

| Seletor | Especificação |
| --- | --- |
| `.app` | Coluna centralizada, `gap: 18px`, `max-width: 460px` |
| `.title` | Texto com gradiente ciano→lime→rosa recortado (`background-clip: text`) |
| `.hud` | Flex com wrap: 2 cards (Pontos, Recorde) + card de carga + botão de som |
| `.card` | Painel translúcido com `backdrop-filter: blur(8px)`, raio 14, valor 22 px/800 |
| `.card.cyan` / `.card.pink` | Valor colorido com brilho (`text-shadow`) |
| `.card.charge` | Card da carga: 5 "pips" de 8 px; `.active` deixa borda e rótulo âmbar |
| `.card.charge .pips i.on` | Pip preenchido: gradiente âmbar + brilho |
| `.board-wrap` | Moldura de 6 px, raio 20, gradiente ciano→violeta→rosa, sombra `0 20px 50px` |
| `.board-wrap.is-turbo` | Moldura em âmbar (`#fbbf24 → #fde68a → #f59e0b`) + halo amarelo, transição 0.18 s — **turbo do `Espaço`** |
| `.board-wrap.is-ability` | Moldura **laranja** (`#fdba74 → #fb923c → #f97316`) com anel de 2 px e halo de 46 px — **habilidade especial** |
| `canvas` | `aspect-ratio: 1/1`, raio 14, `touch-action: none` |
| `.overlay` | `inset: 6px`, fundo `rgba(10,15,39,0.72)`, blur 6 px, centralizado |
| `.btn` | Gradiente ciano→lime, raio 12, hover eleva 2 px |
| `.btn.secondary` / `.btn.ghost` | Variante violeta→rosa / vidro translúcido |
| `.mute-btn` | 44×44, raio 12, ícone 20 px |
| `.dpad` | Grid 3×2 de 64 px, `gap: 10px`; 56 px abaixo de 420 px |
| `.pad-btn` | Gradiente azul→violeta, "3D" via `box-shadow 0 6px 0`, afunda no `:active` |
| `.info` | Texto de ajuda, 13 px, centralizado, `--muted` |

Responsividade: `@media (max-width: 420px)` reduz d-pad (56 px) e padding dos cards.

### Indicador de turbo e da habilidade

O turbo **não** usa badge/pílula. Ele é comunicado pela **borda do tabuleiro**: `.board-wrap` recebe `is-turbo` enquanto `boost` é verdadeiro, acendendo em amarelo e voltando ao gradiente normal (com transição) ao soltar a tecla, pausar, morrer, sair, resetar ou perder o foco.

A habilidade especial usa a mesma linguagem com outra cor (`is-ability`, moldura **laranja** com anel de 2 px e halo de 46 px) e tem precedência sobre `is-turbo`. Além disso, o card **Carga** no HUD mostra 5 pips: preenchidos conforme `foodCount` e cheios enquanto a habilidade está ativa.

### Acessibilidade

- `aria-label` no canvas ("Tabuleiro do jogo") e nos botões do d-pad/pausa.
- `aria-label` dinâmico no botão de som (`Ativar som` / `Desativar som`) com `title`.
- Hierarquia de headings: `h1` (título) e `h2` (overlays).
- Texto sempre em pt-BR; contraste alto (texto claro sobre fundo escuro).

---

## 14. Áudio

`src/lib/sound.ts` sintetiza tudo por osciladores — **nenhum arquivo de áudio** é carregado.

- `getCtx()` cria/reaproveita um `AudioContext` (fallback `webkitAudioContext`) e o retoma se estiver suspenso; retorna `null` quando mudo, em SSR ou sem suporte.
- `tone()` agenda oscilador com envelope de ganho (ataque 12 ms, decaimento até `0.0001`) e desconecta os nós em `onended` (sem vazamento).
- `muted` é lido do `localStorage` no carregamento do módulo, com `try/catch`.

| Efeito | Desenho sonoro |
| --- | --- |
| `eat` | Blip ascendente duplo (quadrada 660→1046 + triangular 990→1568) |
| `die` | Queda grave em serra (340→70 + quadrada 190→50) |
| `start` | Arpejo de três notas (523 / 659 / 784) |
| `pause` | Descida suave (620→300) |
| `click` | Clique curto (880) |

API: `sfx.eat()`, `sfx.die()`, `sfx.start()`, `sfx.pause()`, `sfx.click()`, `sfx.isMuted()`, `sfx.setMuted(v)`, `sfx.toggleMuted()`.

---

## 15. Persistência local

| Chave | Conteúdo | Escrita | Leitura |
| --- | --- | --- | --- |
| `snakeBest` | Recorde de pontos | Ao superar o recorde, durante a partida | Montagem do componente |
| `snakeMuted` | Som mudo (`'1'` = mudo) | Ao alternar o botão | Inicialização do módulo `sound.ts` |

- Leituras sempre depois da montagem (evita erro de hidratação).
- Todas as chamadas em `try/catch`: sem storage o jogo funciona, apenas não persiste.
- Nenhum dado sai do dispositivo; não há cookies, telemetria ou backend.

---

## 16. Desempenho

- Loop desacoplado do framerate por acumulador de tempo.
- Sem re-render do React por quadro: apenas HUD/overlay quando algo relevante muda.
- Canvas dimensionado por DPR com `setTransform` (nitidez sem recriar contexto).
- `guard` de 4 passos por quadro e `dt` limitado a 200 ms evitam "espiral da morte".
- Nenhuma dependência externa em runtime além de React/Next.

---

## 17. Deploy e infraestrutura

| Item | Detalhe |
| --- | --- |
| Hospedagem | Vercel (projeto `oc-ara/snake-rush`) |
| URL de produção | https://snake-rush-delta.vercel.app |
| Build | `next build` (Turbopack), páginas estáticas (`/`, `/_not-found`) |
| Backend | Nenhum — sem funções serverless, banco ou variáveis de servidor |
| Auto-deploy | Push na `developer` → **produção**; outras branches → **preview** |
| Deploy manual | `vercel deploy --prod` (CLI autenticada; primeiro uso exige `vercel link`) |
| Arquivos locais | `.vercel/` e `.env.local` são gerados pelo CLI e ficam fora do Git |

### Variáveis de ambiente

- `.env.local` contém apenas `VERCEL_OIDC_TOKEN`, gerado pelo Vercel CLI. **Nunca** commitar: `.gitignore` cobre `.env*` (exceto um futuro `.env.example`).
- O app não lê nenhuma variável de ambiente em runtime.

### Regra de deploy (obrigatória — `AGENTS.md`)

> **Deploy somente on demand. Nunca publique sem ordem explícita do usuário.**

Proibido sem autorização inequívoca:

- `vercel deploy`, `vercel deploy --prod`, `vercel --prod`;
- `git push` para `developer` (dispara produção automática);
- criar/aprovar/promover deployment no painel da Vercel;
- qualquer ação que publique produção **ou** preview.

Pedido ambíguo ("testa se está tudo certo") **não** autoriza. Quando autorizado: confirmar alvo (produção/preview), rodar build + typecheck e informar a URL resultante. Commit local segue permitido como parte da tarefa; push, merge em `developer` e force-push exigem ordem explícita.

---

## 18. Versionamento, rollback e snapshots

### Camadas de recuperação

| Camada | Onde | Garantia |
| --- | --- | --- |
| Git | branch `developer` no GitHub | Histórico completo, diffs, `git revert` |
| Backup local | `.backup/v1-2026-10-27/` (não versionado) | Cópia byte a byte da v1 com `MANIFEST.sha256` |
| ai-memory | páginas `snapshots/2026-10-27-jogo-da-cobrinha-v1*` | Cópia em texto da v1, independente do disco |

### Histórico de versões

| Versão | Referência | Estado |
| --- | --- | --- |
| v1 | `629c0a5` | React + Vite (preservada em backup, Git e ai-memory) |
| v2 | `2.0.0` | **Atual** — migração para Next.js 16 App Router |

### Convenções

- Fluxo local: `git status` → `npm run typecheck` → `npm run build` (opcional) → `git add -A` → commit → push.
- Mensagens no padrão `tipo: descrição` (`feat`, `fix`, `chore`, `docs`, `refactor`).
- Snapshots são **imutáveis**: crie `v3`, `v4`… e nunca edite um anterior. Cada snapshot registra o commit que representa.
- Procedimento completo (incluindo voltar de Next para Vite): `docs/restauracao-e-snapshots.md`.

---

## 19. Versão legada

`public/snake.html` é a primeira versão do jogo: um único arquivo HTML com JavaScript puro, servido em `/snake.html` e **fora** do app Next. Não tem pausa, turbo nem som e não recebe melhorias — fica apenas como referência histórica.

---

## 20. Limitações conhecidas

- **Sem vitória:** tabuleiro cheio posiciona a fruta em `{0,0}` em vez de encerrar com vitória.
- **Sem swipe:** em telas de toque o controle é o d-pad.
- **Sem wrap de bordas:** encostar na parede encerra a partida.
- **Recorde único:** não há separação por modo ou dificuldade.
- **Turbo só no teclado:** não há botão de turbo no d-pad (mobile não usa turbo).
- **`snake.html` desatualizado** em relação à versão React.

## 21. Pontos de extensão

Ideias que cabem na arquitetura atual sem refatoração relevante:

- **Comida especial** (bônus temporário): campo extra em `Game`, ramo em `step()` e um desenho adicional.
- **Obstáculos/níveis:** lista de células bloqueadas consultada em colisão e em `placeFood`.
- **Bordas com wrap:** trocar o teste de parede por aritmética modular (atenção à interpolação em `prev`).
- **Swipe em touch:** `touchstart`/`touchend` chamando `enqueue`, reaproveitando o d-pad em telas pequenas.
- **Pausa automática ao perder foco:** o handler de `blur` já existe; hoje ele só desliga o turbo.
- **Volume geral:** parâmetro em `tone()` multiplicando o `volume` de cada efeito.
- **Botão de turbo no mobile** e **modos de dificuldade** (com recordes separados).

---

## 22. Checklist de entrega de mudanças

- [ ] `npm run typecheck` passa
- [ ] `npm run build` passa (verifica tipos e rotas)
- [ ] Nenhuma API de navegador fora de `useEffect`/handlers (hidratação)
- [ ] Controles de teclado e d-pad continuam consistentes
- [ ] Som/mudo e recorde persistindo
- [ ] Layout verificado em desktop e ≤420 px
- [ ] `AGENTS.md` respeitado (sem deploy sem ordem explícita)
- [ ] Se a versão atual deve ser preservada: novo snapshot `v<N>` nas três camadas

---

## 23. Glossário

| Termo | Significado |
| --- | --- |
| **Célula** | Unidade do tabuleiro (20×20 px lógicos) |
| **Passo** | Atualização discreta da simulação (move a cobra uma célula) |
| **Interpolação** | Suavização visual entre `prev[i]` e `snake[i]` pelo fator `t` |
| **Turbo (boost)** | Aceleração temporária enquanto `Espaço` está pressionado (`BOOST_FACTOR`) |
| **DPR** | `devicePixelRatio`, usado para nitidez do canvas |
| **Overlay** | Camada HTML sobre o canvas (título, pausa, fim de jogo) |
| **Snapshot** | Cópia imutável de uma versão (disco, Git e ai-memory) |
