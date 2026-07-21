# Ordens e coisas importantes — Desbrava

Arquivo de instruções permanentes do projeto (o Claude lê isto toda vez
que abre a pasta). Detalhes de conteúdo ficam em `PENDENCIAS.md`;
arquitetura e regras do Firestore em `README.md`.

## Ordens permanentes do Paulo

1. **Versão do app** — `VERSAO_APP` em `js/script.js`. A cada
   atualização que eu entregar, subo **só o último número**
   (0.9.0 → 0.9.1 → 0.9.2 …). O segundo e o primeiro dígito **só mudam
   quando o Paulo pedir**. Manter `versionName` igual e `versionCode`
   +1 em `android/app/build.gradle`. (Versão atual: **0.9.2**.)

2. **APK disponível online (download no site + no menu)** — o app tem
   botão "⬇️ Baixar app" (no aviso flutuante) e "📥 Baixar app" (no
   menu), que apontam pra `URL_APK` em `js/script.js`:
   `https://github.com/pvsm23/mapa-raspadinha-rj/releases/latest/download/Desbrava.apk`.
   Essa URL sempre serve o APK do **último release** — então NÃO muda a
   cada versão. Fluxo a cada build (depois de `gh auth login`, feito 1x):
   - Gerar o APK e copiar pra `C:\Users\eulai\Downloads\Desbrava.apk`.
   - Rodar **`powershell -File tools/publicar-apk.ps1`** (num PowerShell
     novo, pra pegar o `gh` no PATH) — publica/atualiza o release da
     versão atual. O botão do site já passa a baixar a nova versão.
   - `gh` já instalado (winget `GitHub.cli`); falta só o Paulo logar 1x
     com `gh auth login`.

   **Arquivo por versão / Drive** (backup, opcional): também salvar
   `Desbrava-<versao>.apk` em Downloads e mandar pra pasta do Drive
   **"05. Desbrava / APKs por versão"** (id
   `1Vm31g2eNGYE6_b5MwJcai7qDmcS9tPfm`). As tools de Drive não sobem
   12 MB sozinhas; automatizar isso pede `rclone` (config única) — ou o
   Paulo arrasta o arquivo. Cada release do GitHub já é, por si, um
   histórico por versão.

3. **Anúncios (AdSense)** — ideia de banner discreto **só anotada**.
   Não implementar/ativar sem o Paulo pedir de novo. O painel de Admin
   já tem os toggles; o slot só aparece quando o ID real for preenchido.

4. **Plano PRO** — fase 1 (distintivo no ranking) feita. O **código
   secreto de ativação NUNCA vai num arquivo do projeto** (fica só na
   regra do Firestore, valor trocado à mão pelo Paulo).

5. **Selo "dourado"** — em todo texto visível é "dourado" (era
   "brilhante"). Os nomes internos de código/dados/classes/ids/chaves
   (`brilhante`, `selo-item-brilhante`, `aviso-brilhante-*`, conquistas
   `brilhante-N`) **continuam** — não renomear, senão quebra estado
   salvo. Selo dourado **não tem animação de brilho** (removida a
   pedido); só a arte dourada + borda estática.

6. **Chave PIX** — editável pelo Paulo no painel de Admin
   (`configuracoes/global.chavePix`). Não hardcodar de novo.

## Coisas importantes de saber

- **Sem bundler**: `js/script.js` é script normal; `js/auth.js` é módulo
  ES que importa o Firebase do CDN e expõe tudo em `window.raspadinhaAuth`.
- **Fotos → Google Drive** (via Apps Script), não Firebase Storage
  (Storage exige plano Blaje/pago). Vale pra fotos de post E foto de
  perfil (`subirFotoPerfil` reaproveita o mesmo caminho).
- **Foto de perfil**: aparece no avatar do topo e do perfil. Nos
  **posts do feed** o autor ainda aparece com iniciais (cada post
  guarda o autor no momento da criação) — pendente estender, se o Paulo
  quiser.
- **Link web curto**: `desbravaapp.netlify.app` (Netlify grátis).
  Pendente o Paulo criar a conta e adicionar o domínio nos
  "Authorized domains" do Firebase Auth.

## Como gerar o APK (Capacitor)

Sempre nesta ordem, a partir da raiz do projeto:

```bash
node tools/montar-www.js            # monta www/ (allowlist)
npx cap sync android                # copia www + plugins pro Android
# ícone do launcher (só se a logo mudou): node tools/gerar-icone-android.js
cd android
JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" \
ANDROID_HOME="C:\\Android\\Sdk" ./gradlew assembleDebug
# APK sai em C:\Users\eulai\AppData\Local\DesbravaBuild\app\outputs\apk\debug\app-debug.apk
# copiar pra C:\Users\eulai\Downloads\Desbrava.apk
```

Detalhes que evitam erro de build (já configurados):
- `buildDir` fica fora do OneDrive (`android/build.gradle`) — senão o
  OneDrive trava o empacotamento ("Failed to delete some children").
- `android.overridePathCheck=true` (`android/gradle.properties`) — por
  causa do acento em "Área de Trabalho".
- Se `mergeDebugAssets` falhar na 1ª vez (lock do OneDrive), **rodar de
  novo** — costuma passar.
