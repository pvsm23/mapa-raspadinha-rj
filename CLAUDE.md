# Desbrava — CLAUDE.md

Fonte única de memória do projeto. Atualizar só quando o Paulo pedir
"Atualize o resumo" ou ao final de uma funcionalidade grande.

## Escopo

App onde o usuário "raspa" selos dos municípios do RJ num mapa
interativo (SVG), com progresso, ranking, amigos, conquistas, rotas
temáticas (oficiais + personalizadas, sem selo), comunidade
(posts/curtidas/comentários), Motoclube Desbrava (dicas/lojas pra
motociclistas, Garagem Virtual), Loja Desbrava (e-commerce gamificado,
sem gateway de pagamento real) e verificação por GPS via Modo Viagem
(rastreio só em primeiro plano, ligado à mão pelo usuário). Estado de
SP em expansão (mapa navegável, sem conteúdo ainda).

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

## Última funcionalidade (v0.11.5)

- **Loja Desbrava**: e-commerce gamificado, SEM gateway de pagamento
  real (`criarPedido` só registra a intenção de compra no Firestore,
  coleção `pedidos`, não cobra nada de verdade). Catálogo em
  `produtos` (nome/descrição/imagemUrl/tipo físico-digital/estoque/
  valorBase/regraDesbloqueio/status oculto-em_breve-ativo), CRUD só
  pelo admin (`UID_DONO`) num painel dentro de `#modal-admin`.
  - **Gamificação (silhueta)**: produto "ativo" com município da
    `regraDesbloqueio` ainda não raspado (`estaVerificado`) aparece
    com filtro escuro + cadeado na vitrine, botão de compra desativado.
  - **Voucher do Motoclube**: `souMembroMotoclube()` ganha R$4,90/mês,
    não cumulativo (`ultimoMesUsoVoucher` em `usuarios/{uid}`),
    aplicado automaticamente no resumo do checkout.
  - **Frete mockado via ViaCEP**: físico RJ=R$15, outros estados=R$35,
    digital=grátis.
- **3 recursos PRO do Motoclube ligados ao Modo Viagem** (gate
  `souMembroMotoclube()`, mesma regra de "gratuito por enquanto" do
  Motoclube):
  - **Garagem Virtual** (até 3 motos por usuário, `garagem/{uid}/motos/{id}`,
    com abas Criar/Editar/Estatísticas): marca/modelo/apelido + odômetro
    somado sozinho pela moto "ativa" ao encerrar um Modo Viagem.
    Estritamente privado (regra Firestore só permite o dono
    ler/escrever) — nunca aparece em perfil público.
  - **Trilha do trajeto**: Modo Viagem grava as coordenadas percorridas;
    ao encerrar, dá pra salvar como `rotasPersonalizadas` (campo
    `trilha`), privada por padrão (`publica: false` — aviso: a leitura
    dessa coleção continua liberada por id pra qualquer logado, é o
    que faz o link compartilhado funcionar; "privada" aqui é só não
    aparecer em listagem nenhuma).
  - **Resumo + compartilhamento**: tela com km/tempo/municípios e
    geração de imagem via `<canvas>` (cartão do app ou por cima de
    foto escolhida no aparelho), pra postar na Comunidade (reusa
    `criarPost`) ou compartilhar fora do app (Web Share API).
  - Log privado das viagens: coleção `viagens` (append-only, só o dono
    lê; ganhou o campo `motoId` pra estatística por moto).
- **Modo Viagem** (base, gratuita pra todos): substituiu de vez o
  rastreio em segundo plano (`@capacitor/background-runner`, removido
  do projeto). Foreground service explícito
  (`@capacitor-community/background-geolocation`), ligado só pelo
  botão flutuante acima da bússola, com notificação fixa enquanto
  ativo. Sem `ACCESS_BACKGROUND_LOCATION` no manifest (motivo da
  rejeição na Play Store). Município detectado vira
  `municipiosPendentesVerificados` (localStorage) até a pessoa tocar
  pra raspar.
- Firestore com `persistentLocalCache` (grava progresso offline, em
  estrada sem sinal, e sincroniza sozinho depois).
- Motoclube Desbrava: dicas/lojas (peças, oficinas, acessórios...) com
  filtro de marca/modelo, coleção `motoclubeItens`. Gratuito hoje,
  preparado pra cobrança futura (ver regra fixa acima).
- Rotas personalizadas (sem selo): criar/salvar/compartilhar (link ou
  post na Comunidade), coleção `rotasPersonalizadas`.
