# Backlog — SnakeRush

> Derivado de `Roadmap` (Especificação Técnica: Versão Mobile e Nova Mecânica de Jogo) + estado atual da v2.0.0.
> **Ordem de execução:** ondas 1 → 5, na sequência em que aparecem. Não pule para o mobile antes de fechar a mecânica.
> **Atualizado:** 2026-10-27

## Progresso

**2026-10-27 — onda 1 e onda 2 implementadas na branch `feat/habilidade-e-mobile`** (commit pendente de revisão):
E0-01 … E0-04, E1-01 … E1-06, E2-01, E2-02 e E2-04 concluídas. `tsc --noEmit` e `next build` verdes.
Ponto de retorno salvo antes da mudança: tag `checkpoint-2026-10-27-pre-habilidade`, `.backup/v2.1-pre-habilidade-2026-10-27/` e página `snapshots/2026-10-27-checkpoint-pre-habilidade` no ai-memory.
**Aguardando:** teste manual do usuário (E1-07) para decidir entre manter a mecânica ou reverter ao checkpoint.

## Legenda

| Símbolo | Significado |
| --- | --- |
| `[ ]` / `[x]` | Pendente / concluído |
| **P** / **M** / **G** | Pequeno (≤1 h) · Médio (2–4 h) · Grande (1 dia+) |
| 🔒 | Bloqueado por decisão ou tarefa anterior |

## Visão por onda

| Onda | Tema | Épico | Entrega ao final |
| --- | --- | --- | --- |
| **1** | Fundação | E0 | Baseline verde + decisões de spec fechadas |
| **2** | Mecânica | E1 | Barra de 5, modo especial, auto-corte com bônus |
| **3** | Feedback | E2 | Barra no HUD, borda/estado visual e áudio da habilidade |
| **4** | Mobile web | E3 | PWA instalável e offline |
| **5** | Lojas | E4 | Builds Android/iOS via Capacitor |
| **6** | Fechamento | E5 | QA, docs e release |

---

## E0 — Fundação e decisões

### E0-01 · Baseline verde · **P** ✅
- [x] `npm run typecheck` e `npm run build` passando na `developer`
- [x] `git status` limpo (ou mudanças intencionais commitadas)
- **Aceite:** build de produção gera `/` e `/_not-found` sem warnings novos.
- **Concluído em 2026-10-27:** `tsc --noEmit` sem erros; `next build` compilou em 178 ms e gerou `/` e `/_not-found` (prerender estático) sem warnings.

### E0-02 · Fechar as ambiguidades da spec · **M** 🔒
Resolve a tabela [Decisões pendentes](#decisões-pendentes-antes-de-codar). Sem isso, E1-02/E1-03 ficam bloqueados.
- [x] Registrar as respostas em `DOSSIER.md` (seção de regras) e no topo deste backlog
- **Aceite:** nenhuma tarefa de E1 depende de interpretação.
- **Aprovado em 2026-10-27:** usuário escolheu a opção 1 — todas as propostas D1–D8 valem como especificação.

### E0-03 · Criar branch de trabalho · **P** ✅
- [x] `git checkout -b feat/habilidade-e-mobile`
- **Aceite:** `developer` permanece intocada até a revisão final (evita deploy automático — ver `AGENTS.md`).

### E0-04 · Constantes da nova mecânica · **P** ✅
- [x] Em `src/components/SnakeGame.tsx`, extrair: `ABILITY_THRESHOLD = 5`, `ABILITY_DURATION_MS = 2000`, `ABILITY_SPEED_FACTOR` (ver decisão D2), `CUT_BONUS_PER_SEGMENT = 20`, `CUT_BONUS_SFX`
- **Aceite:** nenhum número mágico novo espalhado pelo arquivo.

---

## E1 — Mecânica: barra de 5, turbo especial e auto-corte

> Arquivo principal: `src/components/SnakeGame.tsx`. A lógica vive em `step()` + loop (`frame()`) + `Game`.

### E1-01 · Estender o modelo `Game` · **P** 🔒 E0-04
- [x] Adicionar `foodCount: number`, `isAbilityActive: boolean`, `abilityTimer: number`
- [x] Inicializar em `createGame()` (`0`, `false`, `0`)
- **Aceite:** `tsc --noEmit` passa; `reset`/`exitToTitle`/`start` recriam o estado zerado.

### E1-02 · Contador da barra (0→5) · **P** 🔒 E0-02
- [x] Em `step()`, no ramo "comeu": `foodCount++`
- [x] Se `foodCount >= ABILITY_THRESHOLD` **e** esta é a recolha seguinte (ver decisão D1): ativar habilidade
- [x] Ao ativar: `isAbilityActive = true`, `abilityTimer = ABILITY_DURATION_MS`, `foodCount = 0`
- **Aceite:** 5 frutas enchem a barra; a 6ª ativa; o ciclo recomeça em 0; nunca passa de 5 na UI.

### E1-03 · Aceleração de 200% durante a habilidade · **M** 🔒 E0-02
- [x] No cálculo de `interval` (loop **e** dentro do `while`), aplicar `ABILITY_SPEED_FACTOR` quando `isAbilityActive`
- [x] Garantir que a mudança de intervalo **não** reposiciona o acumulador de forma a causar salto
- [x] Definir precedência com o turbo do `Espaço` (decisão D3)
- **Aceite:** durante 2 s os passos ficam ~2× mais rápidos; ao terminar, o ritmo volta exatamente ao anterior (`speed` base preservado).

### E1-04 · Temporizador no loop · **P** 🔒 E1-02
- [x] A cada quadro: se ativo, `abilityTimer -= dt`; se `<= 0`, desligar e manter `abilityTimer = 0`
- [x] Pausa: **não** consumir tempo (hoje `dt` só é aplicado ao `acc` em `running` — replicar a regra)
- [x] Morte/reset/saída/troca de foco: desligar a habilidade
- **Aceite:** 2 s reais de jogo; pausar congela o contador; sair do jogo não deixa resíduo.

### E1-05 · Colisão: auto-corte em vez de morte · **G** 🔒 E1-01
Ponto mais delicado — a colisão hoje é testada **antes** de a nova cabeça entrar no corpo.

- [x] Reaproveitar o índice da colisão já calculado no teste (corpo sem cauda quando não come)
- [x] Se `isAbilityActive`: cortar em `snake.slice(0, cutIndex)` e montar `[head, ...cortado]`
- [x] Calcular `cutSegmentsCount = snake.length - cutIndex` (segmentos efetivamente removidos)
- [x] Bônus: `cutSegmentsCount * CUT_BONUS_PER_SEGMENT` somado ao `score`
- [x] Atualizar `prev` para refletir o novo corpo (o desenho usa `prev[i] ?? seg`; garantir que não "pisca")
- [x] Propagar o novo tamanho para interpolação (`t`) sem quebrar segmentos
- [x] Se a habilidade estiver inativa: comportamento atual (morte) inalterado
- **Aceite:** cortar com a habilidade ativa não encerra a partida, soma bônus correto e a cobra continua jogável no quadro seguinte; sem habilidade, morte como hoje.

### E1-06 · Bônus entra no HUD, no recorde e no som · **M** 🔒 E1-05
- [x] Criar callback `onCut(bonus)` análogo a `onEat`
- [x] Atualizar `score` (React), comparar/gravar `snakeBest` e tocar som de sucesso
- [x] Evitar duplicar lógica de recorde: extrair helper `commitScore(delta)`
- **Aceite:** o bônus aparece no placar no mesmo quadro, é salvo no recorde e dispara áudio uma única vez.

### E1-07 · Testes manuais dirigidos · **M** 🔒 E1-06
- [ ] Cenários: ativar e cortar; cortar sem habilidade (morte); cortar no último ms; pausar durante habilidade; habilidade expirando no mesmo passo de uma colisão
- [ ] Cenário de borda: cobra de 3 segmentos, colisão na cauda (não deve cortar errado)
- **Aceite:** todos os cenários registrados neste arquivo com resultado.

---

## E2 — Feedback visual e sonoro

### E2-01 · Barra de 5 unidades no canto superior esquerdo · **M** 🔒 E1-02
- [x] Componente no HUD (ou dentro de `.board-wrap`, canto sup. esq.) com 5 "pips"
- [x] Preenchidos = `foodCount`; estado ativo = 5/5 pulsando ou dourado
- [x] `aria-label`/`role="progressbar"` com `aria-valuenow` = `foodCount`, `aria-valuemax` = 5
- [x] Responsivo: não empurrar o HUD em telas ≤420 px
- **Aceite:** reflete o estado em tempo real, sem re-render por quadro (só quando `foodCount` muda).

### E2-02 · Indicador de habilidade (usar a borda) · **P** 🔒 E1-02
- [x] Reaproveitar `.board-wrap.is-turbo` (âmbar) para o modo especial
- [x] Distinguir visualmente turbo do `Espaço` e habilidade (ex.: brilho mais intenso/pulso na habilidade)
- [x] Remover qualquer badge/pílula remanescente (já não existe)
- **Aceite:** ao ativar, a borda acende por 2 s; ao expirar, volta ao gradiente normal com transição.

### E2-03 · Contagem regressiva discreta · **P** 🔒 E2-02
- [ ] Opcional: esmaecer a borda conforme `abilityTimer` cai (sem texto na tela)
- **Aceite:** dá para perceber o fim da habilidade sem ler números.

### E2-04 · Áudio da habilidade e do corte · **P** ✅
- [x] `sfx.ability()` (ativação) e `sfx.cut()` (corte com bônus) em `src/lib/sound.ts`
- [x] Respeitar mudo; sem arquivos de áudio
- **Aceite:** sons distintos de `eat`/`die`; nada toca com o som desativado.

### E2-05 · Vibração (preparação para mobile) · **P** 🔒 E4-01
- [ ] `navigator.vibrate` apenas se existir, e apenas no corte/ativação
- [ ] Fallback silencioso no iOS (sem suporte)
- **Aceite:** não quebra em navegador sem a API.

---

## E3 — Mobile web (PWA)

### E3-01 · Manifest e ícones · **M**
- [ ] `src/app/manifest.ts` (ou `public/manifest.webmanifest`) com `name`, `short_name`, `start_url: "/"`, `display: "standalone"`, `orientation: "portrait"`, `background_color`/`theme_color: #0a0f27`
- [ ] Ícones 192/512 + `maskable` + `apple-touch-icon` 180
- **Aceite:** Lighthouse → "Installable"; ícone correto no Android e iOS.

### E3-02 · Service worker / offline · **G** 🔒 E3-01
- [ ] Escolher abordagem (Serwist ou SW manual) e registrar a decisão
- [ ] Precache do shell (`/`, CSS, JS) e estratégia *stale-while-revalidate* para assets
- [ ] Página offline de fallback
- **Aceite:** após 1ª visita, o jogo abre em modo avião; nova versão publicada aparece no 2º carregamento.

### E3-03 · Ajustes de tela cheia no mobile · **M**
- [ ] `viewport-fit=cover` + `env(safe-area-inset-*)` no `.app`
- [ ] Evitar *bounce*/zoom: `overscroll-behavior`, `touch-action` já aplicado no canvas
- [ ] Testar 360×640, 390×844, 414×896
- **Aceite:** nada cortado por notch/barra de gestos; d-pad alcançável com o polegar.

### E3-04 · Turbo no d-pad · **M** 🔒 E1-03
- [ ] Botão de turbo (press-and-hold) no mobile, mesmo `boostRef` do teclado
- [ ] `pointerdown`/`pointerup`/`pointercancel` + `pointerleave`
- **Aceite:** comportamento idêntico ao `Espaço`, inclusive desligar ao sair do botão/aba.

### E3-05 · Swipe (opcional) · **M**
- [ ] `touchstart`/`touchend` com limiar (~24 px) chamando `enqueue`
- **Aceite:** swipe não dispara clique acidental no d-pad.

---

## E4 — Mobile nativo (Capacitor)

### E4-01 · Export estático · **M**
- [ ] `next.config.ts` → `output: 'export'` e `images: { unoptimized: true }`
- [ ] `npm run build` gera `out/`; `npm start` deixa de servir (documentar)
- **Aceite:** `out/index.html` abre o jogo; `/snake.html` continua acessível.

### E4-02 · Inicializar Capacitor · **M** 🔒 E4-01
- [ ] `npm i @capacitor/core @capacitor/cli`; `npx cap init SnakeRush com.exemplo.snakerush` (definir ID final)
- [ ] `capacitor.config.ts` com `webDir: 'out'`
- **Aceite:** `npx cap sync` conclui sem erro.

### E4-03 · Plataformas · **G** 🔒 E4-02
- [ ] `npx cap add android` (requer Android SDK)
- [ ] `npx cap add ios` (requer macOS + Xcode — registrar bloqueio se não houver)
- [ ] `.gitignore`: decidir versionar ou não `android/` e `ios/`
- **Aceite:** app abre no emulador Android; iOS validado quando houver máquina.

### E4-04 · Empacotamento e assinatura · **G** 🔒 E4-03
- [ ] Ícone/splash, `applicationId`, versão `versionName`/`versionCode`
- [ ] AAB assinado (Play) e archive (App Store)
- **Aceite:** build de release instalável em dispositivo físico.

### E4-05 · Haptics nativos (substitui `navigator.vibrate`) · **P**
- [ ] `@capacitor/haptics` no corte/ativação, com fallback web
- **Aceite:** vibração funciona no Android; iOS respeita as limitações da API.

---

## E5 — Fechamento

### E5-01 · Revisão de arquitetura · **M**
- [ ] `SnakeGame.tsx` perto de 600 linhas: avaliar extrair `game/engine.ts` (puro) + `game/draw.ts`
- **Aceite:** se extrair, build/typecheck verdes e nenhuma regressão de comportamento.

### E5-02 · Documentação · **M**
- [ ] Atualizar `DOSSIER.md` (regras, modelo `Game`, constantes, PWA/Capacitor)
- [ ] Atualizar `README.md` (scripts `cap`, `output: export`)
- [ ] Atualizar `docs/arquitetura.md` (nova mecânica e fluxo de corte)
- **Aceite:** nenhum documento contradiz o código.

### E5-03 · QA final e release · **M** 🔒 todas
- [ ] Matriz de teste: desktop teclado · desktop mouse/d-pad · Android Chrome · iOS Safari · PWA instalada · app nativo
- [ ] `npm run typecheck` + `npm run build`
- [ ] Snapshot `v3` nas três camadas (Git tag, `.backup/`, ai-memory)
- [ ] **Deploy só com ordem explícita** (`AGENTS.md`)
- **Aceite:** checklist de `DOSSIER.md` §22 completo.

---

## Decisões pendentes (antes de codar)

A spec do `Roadmap` tem pontos que se contradizem ou não fecham. Proposta padrão em **negrito** — basta confirmar ou trocar.
**Status: D1–D8 aprovadas em 2026-10-27 (opção 1) e implementadas na branch `feat/habilidade-e-mobile`.**

| ID | Ambiguidade na spec | Proposta |
| --- | --- | --- |
| **D1** | "quando atinge exatamente 5 … a peça seguinte (a 6ª recolha) ativa" | Barra enche na **5ª** fruta; a **6ª** ativa e zera a barra |
| **D2** | "aumento de 200%" **mas** "intervalo desce para metade" (+100% ≠ ×3) | **Intervalo ×0.5** por 2 s (`ABILITY_SPEED_FACTOR = 0.5`) |
| **D3** | Turbo do `Espaço` + habilidade simultâneos | **Não empilham**: durante a habilidade, o `Espaço` não acelera mais |
| **D4** | Bônus do corte: 200% sobre 10 = 20 por segmento | **20 pts/segmento**; não recolhe fruta, não acelera |
| **D5** | Barra no "canto superior esquerdo" — HUD ou dentro do tabuleiro? | **HUD**, acima do tabuleiro (não cobre a jogabilidade) |
| **D6** | Habilidade expira exatamente no passo da colisão | **Habilidade vale até o fim do quadro**; expira só no início do quadro seguinte |
| **D7** | PWA (E3) e Capacitor (E4) são opções concorrentes? | **Ambos**, em ondas separadas: PWA primeiro (sem loja), nativo depois |
| **D8** | ID do app / nome nas lojas | `com.exemplo.snakerush` provisório — definir antes de E4-02 |

## Dependências críticas

```
E0-02 (decisões) ─┬─> E1-02 ─> E1-03 ─> E3-04
                  └─> E1-01 ─> E1-05 ─> E1-06 ─> E1-07
E1-02 ─> E2-01 / E2-02 ─> E2-03
E3-01 ─> E3-02
E4-01 ─> E4-02 ─> E4-03 ─> E4-04
Tudo ─> E5-03 (release)
```

## Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Auto-corte com `prev`/interpolação inconsistente | Cobra "pisca" ou desenha errado | E1-05 com teste visual dedicado; cortar `prev` junto |
| Bônus fora do caminho de recorde | Placar e recorde divergem | Centralizar em `commitScore()` (E1-06) |
| `output: 'export'` quebrar o dev | Ninguém consegue rodar local | Validar `npm run dev` após E4-01 |
| `ios/` exige macOS | Bloqueio de loja Apple | Registrar bloqueio; PWA cobre iOS no curto prazo |
| Push na `developer` dispara produção | Deploy acidental | Trabalhar em branch (E0-03) + regra do `AGENTS.md` |

## Definição de pronto (por tarefa)

1. `npm run typecheck` passa.
2. `npm run build` passa.
3. Comportamento antigo preservado (morte sem habilidade, turbo do espaço, recorde).
4. Sem API de navegador fora de `useEffect`/handlers (hidratação).
5. `DOSSIER.md` atualizado quando a regra, constante ou arquivo mudar.
