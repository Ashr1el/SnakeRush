# Empacotamento nativo (Capacitor)

O app web vira app Android/iOS embrulhando o build estático (`out/`) em uma WebView nativa. Tudo o que é **web** já está pronto; o que falta é gerar os projetos nativos — e isso **não roda nesta máquina** (ver `AGENTS.md`).

> ⚠️ **Regra do projeto:** nada de Android nesta máquina. Nem `npx cap add/sync/open/run android`, nem Gradle, ADB, emulador, Android Studio ou instalação de SDK. Os comandos abaixo são para **outra máquina ou CI**.

---

## O que já está pronto

| Item | Onde |
| --- | --- |
| Build estático (`out/`) | `next.config.ts` com `output: 'export'` |
| Configuração do Capacitor | `capacitor.config.ts` (`appId`, `appName`, `webDir: 'out'`) |
| Dependências | `@capacitor/core`, `@capacitor/cli`, `@capacitor/haptics` |
| Vibração nativa com fallback web | `src/lib/haptics.ts` |
| Ícone e splash | `public/icon-*.png` (regeneráveis por `npm run icons`) |

`appId` provisório: **`com.exemplo.snakerush`** (D8 do backlog). Troque **antes** de publicar — depois do primeiro envio à loja o ID não muda.

---

## Fluxo no Android (executar em outra máquina)

Pré-requisitos: Node 20+, JDK 21 e Android Studio com SDK 35+.

```bash
# 1. build estático atualizado
npm ci
npm run typecheck
npm run build              # gera out/

# 2. criar o projeto nativo (uma vez)
npx cap add android

# 3. copiar o build e sincronizar plugins
npx cap sync android

# 4. abrir no Android Studio (ou buildar direto)
npx cap open android
# alternativa por linha de comando:
cd android && ./gradlew assembleDebug
```

O APK de debug sai em `android/app/build/outputs/apk/debug/app-debug.apk`.

Para instalar em um dispositivo físico:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Release assinado (Play Store)

```bash
keytool -genkey -v -keystore snakerush.keystore -alias snakerush \
  -keyalg RSA -keysize 2048 -validity 10000

cd android && ./gradlew bundleRelease   # gera o .aab em app/build/outputs/bundle/release/
```

O `keystore`, as senhas e o `key.properties` **nunca** entram no Git.

---

## Fluxo no iOS (exige macOS + Xcode)

```bash
npm ci && npm run build
npx cap add ios
npx cap sync ios
npx cap open ios          # abre no Xcode
```

No Xcode: definir *Team* de assinatura, `Bundle Identifier` igual ao `appId`, versão em `Info.plist` e arquivar (*Product → Archive*).

---

## Ícone e splash nativos

O Capacitor não lê o manifest do PWA. Duas opções:

1. **Manual:** copiar `public/icon-512.png` para `android/app/src/main/res/mipmap-*/ic_launcher.png` e para `ios/App/App/Assets.xcassets/AppIcon.appiconset/`.
2. **Automática:** instalar `@capacitor/assets` em outra máquina e rodar `npx capacitor-assets generate` (não executar aqui — só faz sentido junto do `cap add`).

O splash pode ser gerado a partir de `public/icon-512.png` com fundo `#0a0f27` (mesmo `background_color` do manifest).

---

## Depois de qualquer mudança no jogo

```bash
npm run build && npx cap sync android    # ou: npx cap sync ios
```

`cap sync` = `cap copy` (copia `out/` para o projeto nativo) + `cap update` (atualiza plugins).

> `out/` está no `.gitignore`: sempre builde antes de sincronizar.

---

## Decisão sobre versionar `android/` e `ios/`

**Não versionar** (E4-03). Os diretórios são gerados por `npx cap add` e contêm artefatos de build, caches do Gradle e (se mal configurado) credenciais. O que é versionado:

- `capacitor.config.ts`
- dependências no `package.json`
- `src/`, `public/` e a documentação

Se no futuro a assinatura precisar de CI, a prática é versionar apenas `android/app/build.gradle` ajustado e guardar o keystore em *secrets* do CI.

---

## Checklist

- [ ] `appId` definitivo definido (fora de `com.exemplo.*`)
- [ ] `npm run build` sem erros
- [ ] `npx cap add android` + `npx cap sync android` em máquina com SDK
- [ ] app abre no emulador/dispositivo e o jogo responde ao toque
- [ ] vibração funciona no corte e na ativação (Android)
- [ ] orientação travada em retrato e tela cheia (safe-area respeitada)
- [ ] ícone e splash aplicados
- [ ] AAB assinado gerado (Play) / archive no Xcode (App Store)
- [ ] iOS validado em macOS quando houver máquina
