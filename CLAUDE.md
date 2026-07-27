# Desbrava — CLAUDE.md

Fonte única de memória do projeto. Atualizar só quando o Paulo pedir
"Atualize o resumo" ou ao final de uma funcionalidade grande.

## Escopo

App onde o usuário "raspa" selos dos municípios do RJ num mapa
interativo (SVG), com progresso, ranking, amigos, conquistas, rotas
temáticas (oficiais + personalizadas, sem selo), comunidade
(posts/curtidas/comentários), Motoclube Desbrava (dicas/lojas pra
motociclistas) e verificação por GPS via Modo Viagem (rastreio só em
primeiro plano, ligado à mão pelo usuário). Estado de SP em expansão
(mapa navegável, sem conteúdo ainda).

Regras fixas:
- Versão (`VERSAO_APP` em `js/script.js` + `versionCode`/`versionName`
  em `android/app/build.gradle`): sobe só o último dígito por entrega;
  1º/2º dígito só quando o Paulo pedir.
- Segredo do Plano PRO: nunca em arquivo do repo (só na regra do
  Firestore, à mão).
- **Motoclube Desbrava**: gratuito hoje (`souMembroMotoclube()` em
  `js/script.js` sempre `true`), mas já estruturado como feature paga
  (R$ 4,90/mês). **Não implementar cobrança/checkout real nem
  endurecer o gate sem o Paulo pedir de novo** — mesma regra do Plano PRO.
- Selo "dourado" (texto visível) = `brilhante` (código/ids internos,
  não renomear).
- AdSense: não ativar sem pedido explícito.

## Stack

HTML/CSS/JS sem bundler · Firebase Auth+Firestore (Spark) · Fotos no
Google Drive via Apps Script · Capacitor (Android) · GitHub Pages +
Netlify (web) · GitHub Releases (APK, via `tools/publicar-apk.ps1`).

Build APK: `node tools/montar-www.js && npx cap sync android && cd
android && ./gradlew assembleDebug bundleRelease`.

## Última funcionalidade (v0.11.2)

- **Modo Viagem**: substituiu de vez o rastreio em segundo plano
  (`@capacitor/background-runner`, removido do projeto). Agora é um
  foreground service explícito (`@capacitor-community/background-geolocation`),
  ligado só pelo botão flutuante acima da bússola, com notificação fixa
  enquanto ativo. Sem `ACCESS_BACKGROUND_LOCATION` no manifest (motivo
  da rejeição na Play Store). Acumula quilometragem do trajeto e grava
  municípios detectados em `municipiosPendentesVerificados`
  (localStorage) até a pessoa tocar pra raspar.
- Firestore com `persistentLocalCache` (grava progresso offline, em
  estrada sem sinal, e sincroniza sozinho depois).
- Motoclube Desbrava: dicas/lojas (peças, oficinas, acessórios...) com
  filtro de marca/modelo, coleção `motoclubeItens`. Gratuito hoje,
  preparado pra cobrança futura (ver regra fixa acima).
- Rotas personalizadas (sem selo): criar/salvar/compartilhar (link ou
  post na Comunidade), coleção `rotasPersonalizadas`.
