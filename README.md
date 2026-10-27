# 🐍 Jogo da Cobrinha (SnakeRush)

Jogo da cobrinha feito em **React + TypeScript + Vite**, com renderização em canvas, movimento suave entre células, efeitos sonoros gerados por código (sem arquivos de áudio) e suporte a teclado e controles na tela.

> Repositório: https://github.com/Ashr1el/SnakeRush — branch de desenvolvimento: `developer`

---

## Sumário

- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Requisitos](#requisitos)
- [Como rodar](#como-rodar)
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
- Velocidade progressiva: cada fruta acelera o jogo até um limite.
- **Turbo**: segure `Espaço` para acelerar temporariamente (fator `0.5`), com indicador visual na tela.
- Máquina de estados completa: título → jogando → pausado → fim de jogo, com overlays e opções de resumir, resetar ou sair.
- Efeitos sonoros sintetizados com Web Audio API (comer, morrer, iniciar, pausar, clicar) e botão de mudo persistido.
- Recorde salvo no `localStorage`.
- Layout responsivo (desktop e mobile) com d-pad na tela.

## Stack

| Item | Faixa (`package.json`) | Instalado |
| --- | --- | --- |
| React / React DOM | `^18.3.1` | 18.3.1 |
| TypeScript | `^5.6.3` | 5.9.3 |
| Vite | `^5.4.11` | 5.4.21 |
| @vitejs/plugin-react | `^4.3.4` | 4.7.0 |

Versões exatas do que está instalado ficam travadas em `package-lock.json`.

Sem bibliotecas de UI, de estado ou de áudio — apenas React e APIs do navegador (Canvas 2D e Web Audio).

## Requisitos

- **Node.js 18+** (exigência do Vite 5) e npm.

## Como rodar

```bash
npm install        # instala as dependências

npm run dev        # servidor de desenvolvimento (http://localhost:5173)
npm run build      # typecheck (tsc --noEmit) + build de produção em dist/
npm run preview    # serve o build de dist/ para conferência
```

O `npm run build` falha de propósito se houver qualquer erro de TypeScript — o typecheck faz parte do build.

## Controles

| Ação | Teclado | Tela |
| --- | --- | --- |
| Mover | Setas ou `W` `A` `S` `D` | d-pad (↑ ← ↓ →) |
| Iniciar / jogar novamente | `Espaço` ou botão | botão **Iniciar** |
| Turbo (acelerar) | segurar `Espaço` durante o jogo | — |
| Pausar / retomar | `Esc` | menu de pausa |
| Resumir / Reiniciar / Sair | — | botões do menu de pausa |
| Ativar/desativar som | botão 🔇/🔊 | — |

Ao soltar `Espaço` ou perder o foco da janela, o turbo é desligado automaticamente.

## Regras e pontuação

- Cada fruta vale **10 pontos** e faz a cobra crescer um segmento.
- A cada fruta o intervalo entre passos diminui **3 ms**, até o mínimo de `70 ms` (começa em `130 ms`).
- Comer não reposiciona a cobra: a fruta sempre nasce em uma célula livre.
- Bater na parede ou no próprio corpo encerra a partida (sem "atravessar" bordas).
- O recorde é atualizado durante a partida e exibido no HUD junto da barra de velocidade.

Valores ajustáveis ficam no topo de `src/SnakeGame.tsx` (ver [docs/arquitetura.md](docs/arquitetura.md#constantes-de-ajuste)).

## Estrutura do projeto

```
.
├── index.html              # shell do Vite (div#root + /src/main.tsx)
├── package.json            # scripts e dependências
├── tsconfig.json           # TypeScript estrito (strict, noUnused*, jsx react-jsx)
├── vite.config.ts          # plugin React
├── src/
│   ├── main.tsx            # bootstrap React (StrictMode + createRoot)
│   ├── SnakeGame.tsx       # componente principal: loop, regras, render, HUD e overlays
│   ├── sound.ts            # efeitos sonoros via Web Audio API (com mute persistido)
│   └── styles.css          # tema, HUD, tabuleiro, overlays, d-pad e responsividade
├── docs/                   # documentação técnica
│   ├── arquitetura.md
│   └── restauracao-e-snapshots.md
├── snake.html              # versão legada standalone em um único HTML (vanilla JS, fora do build)
└── .backup/                # cópia local de rollback (não versionada)
```

## Arquitetura em resumo

O jogo não usa React para o estado da partida: `SnakeGame.tsx` mantém o estado mutável em um objeto `Game` dentro de um `useRef` e desenha no canvas a cada `requestAnimationFrame`. O React só renderiza o HUD e os overlays, atualizados por `useState` quando algo relevante muda (pontos, recorde, status, turbo). O loop usa um acumulador de tempo, então a velocidade do passo é independente do framerate da tela.

Detalhes de modelo de dados, máquina de estados, loop, renderização e áudio estão em [docs/arquitetura.md](docs/arquitetura.md).

## Persistência local

| Chave (`localStorage`) | Conteúdo |
| --- | --- |
| `snakeBest` | Recorde de pontos |
| `snakeMuted` | Preferência de som (`'1'` = mudo) |

Ambas as leituras são protegidas: se o `localStorage` estiver indisponível (modo restrito, por exemplo), o jogo continua funcionando sem persistir.

## Documentação

- [docs/arquitetura.md](docs/arquitetura.md) — modelo de dados, loop, máquina de estados, renderização, áudio e pontos de extensão.
- [docs/restauracao-e-snapshots.md](docs/restauracao-e-snapshots.md) — como voltar a uma versão anterior (git, backup local e snapshot no ai-memory).

## Versionamento e rollback

- Repositório: `https://github.com/Ashr1el/SnakeRush` — branch `developer`.
- O commit `629c0a5` marca a **versão 1** do jogo (baseline com typecheck verde).
- Existe um snapshot de rollback local em `.backup/v1-2026-10-27/` (com `MANIFEST.sha256`) e uma cópia em texto no wiki do ai-memory.
- Procedimento completo de restauração: [docs/restauracao-e-snapshots.md](docs/restauracao-e-snapshots.md).

## Versão legada

`snake.html` é a primeira versão do jogo, escrita em um único arquivo HTML com JavaScript puro. Ela não é usada pelo build do Vite e é mantida apenas como referência histórica — não recebe as melhorias da versão React.
