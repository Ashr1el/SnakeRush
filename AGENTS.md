# Regras do projeto — SnakeRush

## Deploy somente on demand

**Nunca faça deploy sem uma ordem explícita do usuário.**

Vale para qualquer forma de publicação, inclusive as indiretas:

- ❌ `vercel deploy` / `vercel deploy --prod` / `vercel --prod`
- ❌ `git push` para a branch `developer` — esse push dispara deploy de produção automático na Vercel
- ❌ criar, aprovar ou promover um deployment no painel da Vercel
- ❌ qualquer ação que publique versão em produção ou preview

Só execute após uma instrução inequívoca como "faça o deploy", "publique em produção" ou "pode subir".
Dúvida, pergunta ambígua ou pedido de "testar se está tudo certo" **não** autorizam deploy.

Quando autorizado, confirme o alvo (produção ou preview), rode o build/typecheck antes e informe a URL resultante.

## Antes de qualquer ação destrutiva ou publicadora

`git commit` local é permitido quando faz parte da tarefa pedida. Push, merge em `developer`, force-push e deploy exigem ordem explícita.

## Android: nunca executar nesta máquina

**Não rode nada de Android no ambiente do usuário.** Nem build, nem emulador, nem sincronização.

Proibido sem exceção explícita caso a caso:

- ❌ `npx cap add android`, `npx cap open android`, `npx cap sync android`, `npx cap run android`
- ❌ `gradle`, `./gradlew`, `assembleDebug`, `bundleRelease` ou qualquer build de APK/AAB
- ❌ `adb`, `emulator`, `avdmanager`, `sdkmanager` (Android SDK / platform-tools)
- ❌ abrir Android Studio ou qualquer IDE/ferramenta que inicialize o SDK
- ❌ instalar SDK, JDK ou emulador Android
- ❌ `npm run android` ou script equivalente

O que **é** permitido: escrever/alterar `capacitor.config.ts`, `next.config.ts` (`output: 'export'`), documentação, ícones, `AndroidManifest` e demais arquivos de configuração, além de revisar comandos — desde que **não sejam executados** aqui.

Builds e testes Android acontecem em outra máquina ou em CI; ao chegar nessa etapa, entregue as instruções em vez de rodar.
