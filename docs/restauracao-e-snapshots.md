# Restauração e snapshots

Como voltar a uma versão anterior do jogo quando uma alteração quebra o código.

> Versão documentada: commit `629c0a5` (v1, 2026-10-27).

---

## Camadas de recuperação

Existem três cópias independentes da mesma versão. Use a mais conveniente:

| Camada | Onde | Garantia |
| --- | --- | --- |
| **Git** | branch `developer` em `https://github.com/Ashr1el/SnakeRush` | Histórico completo, comparação de diffs, `git revert` |
| **Backup local** | `.backup/v1-2026-10-27/` na raiz do projeto (não versionado) | Cópia byte a byte com `MANIFEST.sha256` verificável |
| **Snapshot no ai-memory** | páginas `snapshots/2026-10-27-jogo-da-cobrinha-v1*` | Cópia em texto, sobrevive à perda da máquina |

O backup local e o snapshot no ai-memory são complementares: o primeiro é exato e rápido; o segundo é legível e independente do disco.

---

## Restaurar pelo Git

O caminho normal, quando a mudança já foi commitada:

```bash
git checkout developer
git revert <hash-do-commit-quebrado>   # desfaz preservando o histórico
git push origin developer
```

Para voltar um arquivo específico ao estado do commit `629c0a5`:

```bash
git checkout 629c0a5 -- src/SnakeGame.tsx
```

E, se nada foi commitado ainda, basta descartar a working tree:

```bash
git restore .        # descarta alterações não commitadas
git clean -fd        # remove arquivos novos não rastreados (cuidado: irreversível)
```

## Restaurar pelo backup local

Mais rápido quando o repositório ou a rede não estão disponíveis. Rode na raiz do projeto:

```bash
cd "D:/Projeto futuro"
cp -r .backup/v1-2026-10-27/src/. src/
cp .backup/v1-2026-10-27/index.html .backup/v1-2026-10-27/package.json \
   .backup/v1-2026-10-27/tsconfig.json .backup/v1-2026-10-27/vite.config.ts \
   .backup/v1-2026-10-27/snake.html .
sha256sum -c .backup/v1-2026-10-27/MANIFEST.sha256   # todas as linhas devem sair "OK"
npx tsc --noEmit                                    # baseline verde
```

O `MANIFEST.sha256` usa caminhos relativos à raiz — rode o `-c` sempre a partir dela.

## Restaurar pelo snapshot no ai-memory

Se o backup local também se perdeu, o código está em texto nas páginas:

- `snapshots/2026-10-27-jogo-da-cobrinha-v1.md` — índice, hashes e instruções;
- `snapshots/2026-10-27-jogo-da-cobrinha-v1-codigo-app.md` — `SnakeGame.tsx`, `sound.ts`, `main.tsx`;
- `snapshots/2026-10-27-jogo-da-cobrinha-v1-codigo-config.md` — `styles.css`, `index.html`, `package.json`, `vite.config.ts`, `tsconfig.json`, `snake.html`.

Atenção a um detalhe: o ai-memory tem um filtro de segredos que **redige** linhas no formato `const ALGO_KEY = 'valor'`. Na v1 isso atingiu duas linhas legítimas (chaves do `localStorage`):

| Arquivo | Linha | base64 para recuperar o texto exato |
| --- | --- | --- |
| `src/SnakeGame.tsx` | 18 | `Y29uc3QgQkVTVF9LRVkgPSAnc25ha2VCZXN0Jzs=` |
| `src/sound.ts` | 11 | `Y29uc3QgTVVURURfS0VZID0gJ3NuYWtlTXV0ZWQnOw==` |

Decodifique com `echo <base64> | base64 -d` (Git Bash, Linux ou macOS) e substitua a linha inteira do placeholder `[REDACTED:env_secret]`. Depois valide com os hashes do índice — se baterem, a restauração ficou idêntica.

---

## Convenção de snapshots

1. **Antes de uma mudança arriscada**, confirme que a base está sadia: `npx tsc --noEmit`.
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
npx tsc --noEmit               # typecheck antes de commitar
npm run build                  # build de produção (opcional, mas recomendado)
git add -A
git commit -m "feat: <descrição curta>"
git push origin developer
```

- A branch de trabalho é `developer` (também é a padrão do repositório).
- `node_modules/`, `dist/` e `.backup/` estão no `.gitignore` — não entram no repositório.
- Mensagens seguem o padrão `tipo: descrição` (`feat`, `fix`, `chore`, `docs`, `refactor`).

---

## Checklist antes de mudanças grandes

- [ ] `git status` limpo (ou mudanças intencionais identificadas)
- [ ] `npx tsc --noEmit` passando
- [ ] Snapshot da versão atual criado, se ela precisa ser preservada
- [ ] Página do snapshot no ai-memory atualizada com o commit correspondente
