# 🐍 Snake Rush

Snake Rush é um jogo feito em **React + TypeScript + Next.js (App Router)**, com renderização em canvas, movimento suave entre células, efeitos sonoros gerados por código (sem arquivos de áudio) e suporte a teclado e controles na tela.

> Repositório: https://github.com/Ashr1el/SnakeRush — branch de desenvolvimento: `developer`

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Requisitos](#requisitos)
- [Como rodar](#como-rodar)
- [Deploy](#deploy)
- [Controles](#controles)
- [Regras e pontuação](#regras-e-pontuação)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Arquitetura em resumo](#arquitetura-em-resumo)
- [Persistência local](#persistência-local)
- [Documentação](#documentação)
- [Versionamento e rollback](#versionamento-e-rollback)

---

## Funcionalidades

- Tabuleiro 20×20 células (`400×400` px lógicos) desenhado em `<canvas>` com nitidez em telas de alta densidade (DPR-aware).
- Movimento interpolado entre células, com o corpo em gradiente de cor (verde → roxo) e olhos que seguem a direção.
- Comida pulsante com brilho, grade sutil e fundo em gradiente.
- Velocidade progressiva: cada recurso acelera o jogo até um limite.
- **Turbo**: segure `Espaço` para acelerar temporariamente (fator `0.5`), com indicador visual na tela.
- Máquina de estados completa: título → jogando → pausado → fim de jogo, com overlays e opções de resumir, resetar ou sair.
- Efeitos sonoros sintetizados com Web Audio API (comer, morrer, iniciar, pausar, clicar) e botão de mudo persistido.
- Recorde salvo no `localStorage`.
- **Recursos:** a cada 5 recursos, 4 são vermelhos (1 célula, 10 pts, +1 gomo) e 1 é laranja (bloco 2×2, 40 pts, +3 gomos).
- **Habilidade especial:** 5 blocos laranja ativam 4 s de turbo com auto-corte (20 pts por gomo) e crescimento 3× ao comer.
- Layout responsivo (desktop e mobile) com d-pad na tela, swipe no tabuleiro e botão de turbo.
- **PWA instalável** com funcionamento offline (manifest, ícones e service worker próprios, sem dependências).
- Metadados de página (`title`, `description`, `lang="pt-BR"`, `themeColor`) via Metadata API do Next.

## Stack

| Item | Faixa (`package.json`) | Instalado |
| --- | --- | --- |
| Next.js | `^16.4.3` | 16.4.3 |
| React / React DOM | `^19.3.1` | 19.3.1 |
| TypeScript | `^5.6.3` | 5.9.3 |
| @types/node | `^24.10.1` | 24.19.2 |

Sem bibliotecas de UI, de estado ou de áudio — apenas React, Next e APIs do navegador (Canvas 2D e Web Audio). Os únicos pacotes extras são os do **Capacitor** (`core`, `cli`, `haptics`), usados apenas quando o app roda como build nativo. Versões exatas do que está instalado ficam travadas em `package-lock.json`.

## Requisitos

- **Node.js 20.9+** (exigência do Next.js 16) e npm.

## Como rodar

```bash
npm install        # instala as dependências

npm run dev        # servidor de desenvolvimento (http://localhost:3000)
npm run build      # build estático em out/ (inclui o typecheck)
npm run preview    # serve out/ em http://localhost:3000 (npx serve)
npm run typecheck  # apenas o typecheck (tsc --noEmit)
npm test           # testes do núcleo do jogo (node --test)
npm run icons      # regenera os ícones do PWA (scripts/make-icons.mjs)
```

O `next build` falha se houver erro de TypeScript, então o build já valida os tipos.

**Export estático:** `next.config.ts` usa `output: 'export'` (necessário para empacotar com Capacitor), então `next start` não serve mais o app — use `npm run preview`.

## Deploy

- **Produção:** https://snake-rush-delta.vercel.app
- Projeto na Vercel: `oc-ara/snake-rush`, conectado ao repositório do GitHub.
- Push na branch `developer` dispara **deploy de produção** automaticamente; pushes em outras branches geram deployments de *preview*.
- Deploy manual: `vercel deploy --prod` (CLI autenticado nesta máquina; na primeira vez, `vercel link`).
- Não há backend: o app é 100% client-side, então o deploy publica apenas o app Next — nenhuma função serverless, banco ou variável de servidor.
- Localmente, o `vercel link` cria `.vercel/` e um `.env.local` com `VERCEL_OIDC_TOKEN`; ambos ficam fora do Git.

## Controles

| Ação | Teclado | Tela |
| --- | --- | --- |
| Mover | Setas ou `W` `A` `S` `D` | d-pad (↑ ← ↓ →) ou swipe no tabuleiro |
| Iniciar / jogar novamente | `Espaço` ou botão | botão **Iniciar** |
| Turbo (acelerar) | segurar `Espaço` durante o jogo | segurar **⚡ Segure para turbo** |
| Pausar / retomar | `Esc` | menu de pausa |
| Resumir / Reiniciar / Sair | — | botões do menu de pausa |
| Ativar/desativar som | botão 🔇/🔊 | — |

Ao soltar `Espaço` ou perder o foco da janela, o turbo é desligado automaticamente.

## Regras e pontuação

- **Vermelho** (4 de cada 5 recursos): **10 pontos**, cresce 1 gomo e reduz o intervalo entre passos em **3 ms**, até o mínimo de `70 ms` (começa em `130 ms`).
- **Laranja** (1 de cada 5): bloco de **4 células (2×2)**, **40 pontos**, cresce 3 gomos. Encostar em qualquer célula coleta o bloco inteiro.
- O recurso sempre nasce em área livre; sem espaço para o bloco, o laranja cai para 1 célula.
- **Barra da habilidade:** só o laranja conta — **5 blocos** ativam a habilidade por **4 s**. O card do HUD mostra dois marcadores de 5 pips: vermelho em cima (recursos vermelhos) e laranja embaixo (blocos laranja).
- **Habilidade:** intervalo pela metade (não acumula com o turbo do `Espaço`), **crescimento ×3** ao comer (vermelho +3, laranja +9) e encostar no próprio corpo **corta** em vez de matar — cada gomo cortado vale **20 pontos**.
- Fora da habilidade, bater na parede ou no próprio corpo encerra a partida (sem "atravessar" bordas).
- O recorde é atualizado durante a partida e exibido no HUD.

Valores ajustáveis ficam em `src/game/engine.ts` (regras e ritmo) e no componente (persistência) — ver [docs/arquitetura.md](docs/arquitetura.md#constantes-de-ajuste).

## Estrutura do projeto

```
.
├── next.config.ts          # Next + export estático (out/)
├── capacitor.config.ts     # configuração do app nativo (webDir: out)
├── package.json            # scripts e dependências
├── tsconfig.json           # TypeScript estrito + alias @/* → src/*
├── public/
│   ├── snake.html          # versão legada (servida em /snake.html, fora do app)
│   ├── sw.js               # service worker (shell offline + cache em runtime)
│   ├── offline.html        # fallback sem rede
│   └── icon-*.png          # ícones do PWA (+ apple-touch-icon.png)
├── scripts/
│   ├── make-icons.mjs      # gera os ícones PNG sem dependências
│   └── serve.mjs           # servidor estático do build (npm run preview)
├── src/
│   ├── app/
│   │   ├── layout.tsx      # <html>/<body>, metadata, viewport e CSS global
│   │   ├── manifest.ts     # manifest do PWA
│   │   ├── icon.png        # favicon
│   │   ├── page.tsx        # rota "/" — apenas monta o componente do jogo
│   │   └── globals.css     # tema, HUD, tabuleiro, overlays, d-pad e responsividade
│   ├── components/
│   │   ├── SnakeGame.tsx   # "use client": loop, entrada, render, HUD e overlays
│   │   └── PwaRegister.tsx # registra o service worker em produção
│   ├── game/
│   │   ├── engine.ts       # núcleo puro: regras, habilidade, corte e ritmo
│   │   └── engine.test.ts  # testes do núcleo (npm test)
│   └── lib/
│       ├── sound.ts        # efeitos sonoros via Web Audio API (com mute persistido)
│       └── haptics.ts      # vibração nativa (Capacitor) com fallback web
├── docs/                   # documentação técnica
│   ├── arquitetura.md
│   ├── nativo.md
│   └── restauracao-e-snapshots.md
└── .backup/                # cópia local de rollback (não versionada)
```

## Arquitetura em resumo

Next.js App Router: `src/app/page.tsx` é um **server component** que só monta `<SnakeGame />`; o jogo em si é um **client component** (`'use client'`), porque depende de canvas, teclado, `requestAnimationFrame` e `localStorage`.

As **regras** ficam em `src/game/engine.ts`, um módulo puro (sem React nem DOM) com o modelo `Game`, `step()`, `stepInterval()` e `placeFood()`. Isso permite testar a mecânica com `npm test` e mantém o componente só com loop, entrada e desenho.

O jogo não usa React para o estado da partida: `SnakeGame.tsx` mantém o objeto `Game` em um `useRef` e desenha no canvas a cada quadro. O React só renderiza o HUD e os overlays, atualizados por `useState` quando algo relevante muda (pontos, recorde, carga, status, turbo). O loop usa um acumulador de tempo, então a velocidade do passo é independente do framerate da tela.

Como a página é renderizada no servidor antes de hidratar no cliente, tudo que vem do `localStorage` (recorde e preferência de som) é lido em `useEffect`, depois da montagem — assim o HTML do servidor não diverge do primeiro render do cliente.

Detalhes de modelo de dados, máquina de estados, loop, renderização, áudio e fronteira servidor/cliente estão em [docs/arquitetura.md](docs/arquitetura.md).

## Persistência local

| Chave (`localStorage`) | Conteúdo |
| --- | --- |
| `snakeBest` | Recorde de pontos |
| `snakeMuted` | Preferência de som (`'1'` = mudo) |

As leituras acontecem depois da montagem (evitando erro de hidratação) e são protegidas: se o `localStorage` estiver indisponível (modo restrito, por exemplo), o jogo continua funcionando sem persistir.

## Documentação

- [docs/arquitetura.md](docs/arquitetura.md) — modelo de dados, loop, máquina de estados, renderização, áudio, fronteira servidor/cliente e pontos de extensão.
- [docs/nativo.md](docs/nativo.md) — Capacitor: como gerar os projetos Android/iOS (em outra máquina), ícone, splash e assinatura.
- [docs/restauracao-e-snapshots.md](docs/restauracao-e-snapshots.md) — como voltar a uma versão anterior (git, backup local e snapshot no ai-memory), incluindo o retorno à versão Vite.

## Versionamento e rollback

- Repositório: `https://github.com/Ashr1el/SnakeRush` — branch `developer`.
- **v1** (`629c0a5`): versão original em React + Vite.
- **v2** (`2.0.0`): migração para Next.js.
- **v3** (tag `v3`): habilidade + auto-corte, PWA offline, controles de toque, export estático e núcleo testável.
- A v1 continua preservada em `.backup/v1-2026-10-27/`, a v2.1 em `.backup/v2.1-pre-habilidade-2026-10-27/` e a v3 em `.backup/v3-2026-10-27/` (todas com `MANIFEST.sha256`), além do histórico do Git e das páginas `snapshots/*` do ai-memory.
- Procedimento completo de restauração (incluindo como voltar de Next para Vite): [docs/restauracao-e-snapshots.md](docs/restauracao-e-snapshots.md).

## Versão legada

`public/snake.html` é a primeira versão do jogo, em um único arquivo HTML com JavaScript puro, acessível em `/snake.html`. Ela não faz parte do app Next e não recebe as melhorias da versão React — fica só como referência histórica.
