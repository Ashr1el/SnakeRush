# Restauração e snapshots

Como voltar a uma versão anterior do jogo quando uma alteração quebra o código.

> Versão documentada: **v2.0.0 — Next.js 16** (migração de 2026-10-27). Os comandos marcados como *v1* restauram a versão anterior, em React + Vite.

---

## Camadas de recuperação

Existem três cópias independentes da mesma versão. Use a mais conveniente:

| Camada | Onde | Garantia |
| --- | --- | --- |
| **Git** | branch `developer` em `https://github.com/Ashr1el/SnakeRush` | Histórico completo, comparação de diffs, `git revert` |
| **Backup local** | `.backup/v1-2026-10-27/` na raiz do projeto (não versionado) | Cópia byte a byte **da v1 (Vite)** com `MANIFEST.sha256` verificável |
| **Snapshot no ai-memory** | páginas `snapshots/2026-10-27-jogo-da-cobrinha-v1*` | Cópia em texto **da v1 (Vite)**, sobrevive à perda da máquina |

O backup local e o snapshot no ai-memory são complementares: o primeiro é exato e rápido; o segundo é legível e independente do disco. Ambos congelam a **v1**; a migração para Next.js (v2) vive no Git.

---

## Restaurar pelo Git

O caminho normal, quando a mudança já foi commitada:

```bash
git checkout developer
git revert <hash-do-commit-quebrado>   # desfaz preservando o histórico
git push origin developer
```

Para voltar um arquivo específico a um commit anterior:

```bash
git log --oneline                      # encontre o commit desejado
git checkout <hash> -- src/components/SnakeGame.tsx
```

E, se nada foi commitado ainda, basta descartar a working tree:

```bash
git restore .        # descarta alterações não commitadas
git clean -fd        # remove arquivos novos não rastreados (cuidado: irreversível)
```

---

## Voltar da v2 (Next.js) para a v1 (Vite)

Migração de framework não é só troca de arquivos: o `package.json` e o `tsconfig.json` mudam, e `index.html`, `vite.config.ts` e `src/main.tsx` voltam a existir. Os caminhos do backup correspondem ao layout **antigo** (`src/SnakeGame.tsx`, `src/sound.ts`, `src/styles.css`).

```bash
cd "D:/Projeto futuro"

# 1. remove a estrutura do Next
rm -rf src/app src/components src/lib next.config.ts .next

# 2. traz de volta os arquivos da v1
cp -r .backup/v1-2026-10-27/src/. src/
cp .backup/v1-2026-10-27/index.html .backup/v1-2026-10-27/package.json \
   .backup/v1-2026-10-27/tsconfig.json .backup/v1-2026-10-27/vite.config.ts \
   .backup/v1-2026-10-27/snake.html .

# 3. confere e reinstala as dependências do Vite
sha256sum -c .backup/v1-2026-10-27/MANIFEST.sha256
rm -rf node_modules package-lock.json && npm install
npx tsc --noEmit && npm run build
```

Prefira o caminho do Git quando a v1 ainda estiver no histórico — é menos trabalho e não deixa resíduo:

```bash
git revert --no-commit <hash-da-migracao> && git commit -m "revert: volta para Vite"
```

## Restaurar pelo backup local

Os comandos estão na seção [Voltar da v2 (Next.js) para a v1 (Vite)](#voltar-da-v2-nextjs-para-a-v1-vite) — o backup em `.backup/` é sempre o da v1. O `MANIFEST.sha256` usa caminhos relativos à raiz, então rode o `sha256sum -c` a partir dela.

## Restaurar pelo snapshot no ai-memory

Se o backup local também se perdeu, o código da **v1** está em texto nas páginas:

- `snapshots/2026-10-27-jogo-da-cobrinha-v1.md` — índice, hashes e instruções;
- `snapshots/2026-10-27-jogo-da-cobrinha-v1-codigo-app.md` — `SnakeGame.tsx`, `sound.ts`, `main.tsx`;
- `snapshots/2026-10-27-jogo-da-cobrinha-v1-codigo-config.md` — `styles.css`, `index.html`, `package.json`, `vite.config.ts`, `tsconfig.json`, `snake.html`.

Atenção a um detalhe: o ai-memory tem um filtro de segredos que **redige** linhas no formato `const ALGO_KEY = 'valor'`. Na v1 isso atingiu duas linhas legítimas (chaves do `localStorage`):

| Arquivo (layout da v1) | Linha | base64 para recuperar o texto exato |
| --- | --- | --- |
| `src/SnakeGame.tsx` | 18 | `Y29uc3QgQkVTVF9LRVkgPSAnc25ha2VCZXN0Jzs=` |
| `src/sound.ts` | 11 | `Y29uc3QgTVVURURfS0VZID0gJ3NuYWtlTXV0ZWQnOw==` |

Decodifique com `echo <base64> | base64 -d` (Git Bash, Linux ou macOS) e substitua a linha inteira do placeholder `[REDACTED:env_secret]`. Depois valide com os hashes do índice — se baterem, a restauração ficou idêntica.

---

## Convenção de snapshots

1. **Antes de uma mudança arriscada**, confirme que a base está sadia: `npm run typecheck`.
2. Se a versão atual merece ser preservada, crie `v2`, `v3`… e **nunca edite o snapshot anterior**:
   - backup em disco: `cp -r` para `.backup/v<N>-<AAAA-MM-DD>/` + novo `MANIFEST.sha256`;
   - páginas no ai-memory: `snapshots/<AAAA-MM-DD>-jogo-da-cobrinha-v<N>.md` e as páginas de código correspondentes;
   - commit/tag no Git: `git tag v<N>` e `git push origin v<N>`.
3. Cada snapshot deve registrar **o commit que ele representa**, para que as três camadas possam ser cruzadas.

Snapshots são imutáveis: corrigir um snapshot "antigo" destrói a única coisa que ele oferece — saber exatamente como o código estava.

---

## Fluxo de trabalho no Git

```bash
git status                     # conferir o que mudou
npm run typecheck              # typecheck antes de commitar
npm run build                  # build de produção (opcional, mas recomendado)
git add -A
git commit -m "feat: <descrição curta>"
git push origin developer
```

- A branch de trabalho é `developer` (também é a padrão do repositório).
- `node_modules/`, `.next/`, `out/`, `next-env.d.ts` e `.backup/` estão no `.gitignore` — não entram no repositório.
- Mensagens seguem o padrão `tipo: descrição` (`feat`, `fix`, `chore`, `docs`, `refactor`).

---

## Checklist antes de mudanças grandes

- [ ] `git status` limpo (ou mudanças intencionais identificadas)
- [ ] `npm run typecheck` passando
- [ ] Snapshot da versão atual criado, se ela precisa ser preservada
- [ ] Página do snapshot no ai-memory atualizada com o commit correspondente
