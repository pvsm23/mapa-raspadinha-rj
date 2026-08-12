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
- **Versão** (`VERSAO_APP` em `js/script.js` + `versionCode`/
  `versionName` em `android/app/build.gradle`, sempre os três juntos):
  formato **`0.dia.mês.ano.contagem`** desde 12/08/2026 — ex.
  `0.12.08.26.76`. Dia/mês/ano com dois dígitos; o `0` da frente marca
  que a versão oficial ainda não saiu. A **contagem é o `versionCode`**,
  que sobe de 1 por entrega — ele já era o número de versões do app
  desde antes de existir release, e reusá-lo evita um segundo contador
  pra desencontrar do primeiro.
  - Formato antigo (`0.11.45`, "sobe só o último dígito") valeu até a
    v0.11.45 e ainda aparece nos releases publicados.
  - `ehVersaoMaior` ordena pela **contagem**, não pela data: comparando
    os três primeiros campos, `0.31.08.26.80` pareceria mais nova que
    `0.01.09.26.81` e o aviso de "atualizar app" apontaria pra uma
    versão velha a cada virada de mês. O caminho antigo (3 campos)
    continua no arquivo só pra quem ainda tem `0.11.x` instalado.
- Segredo do Plano PRO: nunca em arquivo do repo (só na regra do
  Firestore, à mão).
- **Motoclube Desbrava**: PAGO desde a v0.11.24, **R$ 9,90/mês**. É o
  único produto pago — o que se chamava "Desbrava PRO" virou isto
  (`ehUsuarioPro()` é só um apelido de `souMembroMotoclube()`). O
  preço aparece em TRÊS lugares que precisam mudar juntos:
  `PRECO_MOTOCLUBE` (js/script.js, só exibição), `PRECO_PRO`
  (tools/apps-script-gerar-cobranca.gs, o que cobra) e
  `MESES_POR_PAGAMENTO` (tools/apps-script-asaas.gs, quanto libera).
  O voucher mensal da Loja vale o MESMO que a assinatura — é uma
  referência (`VALOR_VOUCHER_MOTOCLUBE = PRECO_MOTOCLUBE`), não um
  número solto, porque a ideia do produto é o membro sentir que recebe
  de volta o que pagou. Não "conserte" isso achando que é duplicação.
- Selo "dourado" (texto visível) = `brilhante` (código/ids internos,
  não renomear).
- AdSense: não ativar sem pedido explícito.
- **Tema**: desde v0.11.16 o app tem Sistema/Claro/Escuro (era só dark
  fixo antes disso) — ver seção de tema abaixo antes de presumir que
  "o app é dark-only" numa próxima sessão.
- **Sensor de luz**: existiu um 4º modo de tema ("Automático", via
  `AmbientLightSensor`) da v0.11.16 até a v0.11.20, quando foi removido
  por completo. A WebView do Android bloqueia essa API, o Chrome a
  removeu em 2021 (fingerprinting) e o iOS nunca teve — **não existe
  aparelho real em que funcione, não re-sugerir**.

## Stack

HTML/CSS/JS sem bundler · Firebase Auth+Firestore (Spark) · Fotos no
Google Drive via Apps Script · Capacitor (Android) · GitHub Pages +
Netlify (web) · GitHub Releases (APK).

**Build do APK: pelo CI** (`.github/workflows/build-apk.yml`, desde
v0.11.18). Push na `main` → `npm ci` → `montar-www.js` → `cap sync` →
`assembleDebug` → publica no Releases. O Gradle **não roda no ambiente
do Claude** (o launcher bifurca um daemon e conversa por socket
loopback, bloqueado lá — nem `--no-daemon` nem desligar o sandbox
resolvem), então mover esse passo pro CI é o que permite entregar uma
versão sem ninguém abrir o PowerShell.
- Dois Secrets no repo: `GOOGLE_SERVICES_JSON` e `DEBUG_KEYSTORE_B64`
  (os dois arquivos são gitignorados). O segundo existe porque o
  runner assinaria com uma `debug.keystore` própria, e o Android
  recusa instalar por cima de um app assinado com outra chave.
- Armadilhas já resolvidas, não repetir: Node **22+** (o Capacitor CLI
  recusa o 20), `chmod +x gradlew` (o Windows não guarda o bit no Git),
  e a `signingConfig` de release só pode ser montada se
  `keystore.properties` existir (senão `file('')` derruba até o
  `assembleDebug`).
- O release leva **dois** arquivos: `Desbrava.apk` (que o link
  `latest/download` serve) e `Desbrava-v<ver>.apk`. O nome fixo fazia
  todo download cair por cima do mesmo arquivo em Downloads, e o
  celular acabava oferecendo o APK antigo pra instalar.

Build local (Windows, mais rápido, opcional): `node
tools/montar-www.js && npx cap sync android && cd android &&
./gradlew assembleDebug bundleRelease` — precisa de `JAVA_HOME`
apontando pro JBR do Android Studio. `tools/publicar-apk.ps1` publica o
release à mão (usa o `gh`, instalado em `C:\Program Files\GitHub CLI`,
fora do PATH).

## Última funcionalidade (v0.11.21 a v0.11.24)

**Pagamento do Motoclube, via Apps Script** (v0.11.24): Cloud Functions
exigem Blaze, então os dois backends são Apps Script publicados como
App da Web, cada um num projeto separado (o `doPost` do
`apps-script-feedback.gs` roteia por `tipo` e brigaria; além disso a
URL dele está no repo público, e endpoint de pagamento não pode ficar
exposto). Nenhum segredo nos arquivos — tudo em Propriedades do script.
- `tools/apps-script-gerar-cobranca.gs`: cria a cobrança Pix. No Asaas
  **não existe Pix avulso** — toda cobrança exige um `customer`, e o
  QR Code vem numa chamada SEPARADA (`GET /payments/{id}/pixQrCode`);
  criar a cobrança devolve só o id. O preço é decidido no servidor:
  se viesse do app, bastaria trocar pra 0,01 no DevTools.
- `tools/apps-script-asaas.gs`: webhook. Escreve `ehPro` + `proAte`
  via API REST do Firestore, autenticado por `ScriptApp.getOAuthToken()`
  (a Web API Key do Firebase **não serve** pra isso). Esse token é
  administrativo, então ignora as Regras do Firestore — inclusive a do
  `codigoAtivacaoPro`. Tem idempotência por id de cobrança:
  PAYMENT_CONFIRMED e PAYMENT_RECEIVED chegam pra mesma cobrança.
- **Não dá pra "configurar CORS" no Apps Script** (o ContentService não
  escreve cabeçalho). O que funciona é não provocar o preflight:
  `Content-Type: text/plain`, mesmo truque que o feedback já usava.
- Paywall (`abrirPaywallMotoclube`) + checkout Pix com QR Code e copia
  e cola (com fallback de `execCommand` porque `navigator.clipboard`
  falha em WebView).
- `souMembroMotoclube()` deixou de ser `return true` e virou a fonte
  única: exige `ehPro` E `proAte` no futuro. Casos deliberados: conta
  sem `proAte` (ativação manual antiga) **não expira**, e `proAte` em
  formato inválido **libera** — trancar quem pagou é o pior erro.
- Limite conhecido: o gate é client-side; quem abrir o DevTools passa.
  E revogar `ehPro` pelo app é impossível (a regra do Firestore proíbe
  true→false) — a limpeza teria que ser um gatilho no Apps Script.

**Modo offline (PRO)** (v0.11.23): `baixarDadosOffline()` guarda 125
arquivos (selos, SVGs, JSONs) no CacheStorage, em lotes de 6, a partir
de `data/offline-manifest.json` **gerado** por `tools/montar-www.js` —
na raiz, não em `www/`, porque o site é servido da raiz. O `sw.js` virou
cache-first **só pra imagem**: HTML/CSS/JS seguem network-first de
propósito, senão um deploy novo não apareceria.

**Correção das fotos do feed** (v0.11.22): o `sw.js` interceptava
requisição de OUTROS domínios; resposta de imagem cross-origin é opaca
e o `cache.put()` rejeita com TypeError, quebrando a foto. Agora só
trata GET de mesma origem. Reproduzido servindo o app por HTTP local.

**Sugestões e Novo Post** (v0.11.21): chips de categoria, seletor de
município com busca, grid de cards com foto de fundo, e os formulários
inline viraram bottom sheets. Campos `.campo-material` precisam de
tag + classe + `!important` pra vencer a camada "UI moderna".

## Anterior: aparência e raspadinha (v0.11.17 a v0.11.20)

**Aparência sem `<select>`, e depois sem sensor** (v0.11.17 → v0.11.20):
o `<select>` nativo de tema virou um segmented control
(`#aparencia-opcoes` / `.aparencia-opcao`, botão ativo em `var(--verde)`
com texto `var(--verde-tinta)`). Na 0.11.17 eram 4 opções, com uma
modal de onboarding perguntando pelo sensor de luz na primeira
abertura; na **0.11.20 o modo "Automático" saiu inteiro** (ver Regras
fixas) e sobraram 3. Valor legado `"automatico"` no `localStorage` cai
em `"sistema"` e é regravado (`TEMAS_VALIDOS` em `configurarAparencia`).
- As regras do segmented control são escopadas em
  `#configuracoes-conteudo` **com `!important`** de propósito: a
  "CAMADA UI MODERNA" no fim do `styles.css` força
  `background: var(--surf2) !important` em todo `button` de lá, e sem
  isso o botão ativo sai cinza em vez de verde. Vale pra qualquer
  componente novo dentro de Configurações.
- `<meta name="theme-color">` era fixo em `#000000` (barra de status
  preta com o app branco). Agora `temaEfetivo()` resolve o modo
  "sistema" via `matchMedia("(prefers-color-scheme: dark)")` e
  sincroniza a cor, com listener de `change`.

**Raspadinha: nitidez, alinhamento e brilho** (v0.11.19, em
`js/scratch-card.js`): o buffer do canvas passou a ser
`ladoCSS × devicePixelRatio` (teto 3), com `setTransform` convertendo —
o resto do arquivo continua desenhando em unidades de `tamanho`. As
artes já eram 768×768, então **a fonte nunca foi o problema**; não
importar os PNGs de 7 MB do Drive (5 arquivos = ~36 MB, mais que o
`www/` inteiro) sem ganho visível.
- O wrapper virou `min(tamanho, 100%)` + `aspect-ratio: 1/1`, com os
  dois canvases a 100% dele — antes o selo de 400px (região/rota)
  estourava o modal no celular e o dedo saía do lugar.
- **Bug de fundo, achado aqui**: a capa era pintada no quadrado
  inteiro, mas o `border-radius` impede o dedo de alcançar os cantos
  (~21% da área). Com o limiar em 0.92, a capa cinza (Conquistas,
  municípios sem `fundo.webp`) era **impossível de concluir**. Agora a
  capa é recortada em círculo (`destination-in`) e o progresso é medido
  contra a capa real, não contra o quadrado.
- `.selo-brilhante` tinha `overflow: hidden` **sem** `border-radius` —
  era isso que mostrava os cantos retangulares quando a luz passava.

**Atualização do APK** (v0.11.18): ver Stack. `descobrirUrlApkVersionado`
em `js/script.js` procura o asset `Desbrava-v*.apk` no último release e
o `baixarApk()` prefere esse nome; sem rede, cai no `URL_APK`.
- Nota de campo: trocar a chave de assinatura **impede** instalar por
  cima ("conflito com um pacote já existente"). Aconteceu na migração
  de dispositivo e o Paulo teve que desinstalar/reinstalar uma vez. O
  progresso volta no login (`carregarEstadoDoUsuario` →
  `buscarMeuEstadoCompleto`), o que torna isso seguro.

## Anterior: tema e mapa (v0.11.16)

**Tema Claro/Escuro/Sistema** (v0.11.16): o app não tinha
nenhum sistema de tema até aqui (só dark fixo). Agora `css/styles.css`
tem um bloco `:root` completo de variáveis (`--bg`/`--surf`/`--surf2`/
`--linha`/`--txt`/`--fraco`/`--vidro`/`--backdrop`, além das já
existentes `--verde`/`--ouro`/`--erro`) espelhado num
`:root[data-theme="light"]` + `@media (prefers-color-scheme: light)`
pro modo "Sistema". ~350 cores hexadecimais soltas (a maioria herdada
de antes dessa variável existir) foram convertidas pra usar essas
variáveis. `--verde-tinta` (texto escuro sobre botão verde) e as
cores dos selos/municípios no mapa (verde=visitado, dourado=brilhante,
cinza=bloqueado) ficam **iguais nos dois temas** de propósito — são
cor de estado, não decoração.
- JS (`aplicarDataTheme`/`definirTema`/`configurarAparencia` em
  `js/script.js`): grava em `localStorage` (`desbrava_tema`) e escreve
  `data-theme` em `<html>` (`"light"`/`"dark"`/ausente pro Sistema).
  Depois de mudar o atributo, força `void raiz.offsetHeight` --
  necessário mesmo em navegador de verdade, não só no preview
  (confirmado durante o desenvolvimento: sem isso, pelo menos um
  elemento com `color: var(--txt)` direto no seletor não repintava
  sozinho até o próximo repaint natural).
- Seletor "Aparência" no Card 2 de Configurações — era um `<select>`
  nativo (`#select-aparencia`), virou segmented control na v0.11.17.

**Mapa (tela principal)** (v0.11.16): ícone de "Configurações" trocado
de um sol (confundia com toggle de tema) pra uma engrenagem de
verdade, mesmo id/comportamento. Modo Viagem virou FAB primário
(verde sólido, ícone branco, 58px vs. 48px da bússola, mais espaço
até ela — antes os dois quase se tocavam). Dica "Arraste para
mover..." some sozinha 4s depois de abrir (`configurarDicaMapa`).

## Anterior: Garagem Virtual (v0.11.15)

**Garagem Virtual redesenhada** (v0.11.15): as 3 abas (Criar/Editar/
Estatísticas) viraram um segmented control (só a ativa ganha
destaque, em vez de 3 botões soltos). A lista de motos empilhada —
que duplicava o nome da moto selecionada — deu lugar a um "Card
Seletor" compacto (`renderizarSeletorGaragem`): moto atual + estrela
dourada se for a ativa + setas pra trocar, só quando há 2+ motos. Aba
Estatísticas virou um dashboard de verdade: odômetro como herói
(`Math.round().toLocaleString("pt-BR")`, ex. "1.250 km"), viagens/
última viagem num grid 2 colunas com ícones. "Excluir moto" virou
ghost (só texto vermelho, sem contorno) pra não competir com "Salvar
alterações" (full width).

## Onda de redesign visual (v0.11.6 a v0.11.14)

A maior parte das telas do app passou por uma limpeza de UI, todas seguindo o mesmo
padrão minimalista de tabs (texto cinza inativo, branco + risco verde
embaixo quando ativo — classe `.social-aba`, reaplicada em
`.ranking-aba`/`.biblioteca-aba`/`.rotas-aba`) e um componente de
avatar circular reutilizável (`corAvatar`/`iniciaisApelido` em
`js/script.js`, iniciais sobre gradiente determinístico):
- **Rotas Temáticas** (v0.11.12): grid circular virou lista vertical
  de cards horizontais (miniatura 60x60 + barra de progresso fina +
  chevron), abas Oficiais/Personalizadas, sem cadeado amarelo — rota
  não iniciada (`visitados === 0`, diferente do gate "completa" da
  Biblioteca) fica em tons de cinza (`.rota-card-bloqueada`).
- **Popup do Município** (v0.11.13): selo raspável/revelado encolhido
  pra ~190-200px, status virou pill colorido (`definirStatusMunicipio`
  — verde quando verificado, âmbar quando raspado mas não verificado),
  os 3 botões de ação (Compartilhar/Filtro Comunidade "antigo @"/
  Sugestões — nenhum removido) viraram um grid horizontal discreto
  (`#modal-acoes-grid`/`.modal-acao-btn`), e "Abrir no Maps" trocou o
  bloco verde gigante por um link de texto pequeno.
- **Conquistas** (v0.11.14): cards verticais gigantes (1-2 por tela)
  viraram lista horizontal (medalha 76px + info ao lado); cadeado
  amarelo emoji virou ícone SVG pequeno e discreto; frase "Continue
  jogando para desbloquear" removida; pills de raridade padronizadas
  por cor (cinza/verde/roxo-azulado/dourado). De quebra, o fundo cinza
  chapado da raspadinha sem capa própria (`scratch-card.js`) virou um
  gradiente metálico em todo o app, não só aqui.
- **Menu inferior**: reorganizado em seções (Minha Jornada/Explorar/
  Sistema); Check-in semanal descontinuado por completo (removido de
  HTML/JS/CSS/README); Perfil só abre pelo avatar da topbar.
- **Configurações**: virou cards (`.settings-card`) com toggles CSS
  (`.settings-toggle-switch`) no lugar de checkbox nativo.
- **Comunidade**: feed estilo Instagram/Threads, sem cartões pesados
  (só `border-bottom` fino entre posts), FAB circular pra postar,
  menções `@nome` destacadas (`destacarMencoes` em `js/script.js`).
- **Amigos**: busca contínua (sem botão), avatar, menu "⋮" no lugar do
  botão vermelho de remover (`.amigo-menu`, com "Marcar como Parceiro
  de Estrada" como placeholder pra feature futura).
- **Ranking**: pódio com medalha (🥇🥈🥉) nos 3 primeiros, linha do
  usuário (`.ranking-me`) fixa no rodapé (`position: sticky`) quando
  ele não aparece no topo 50.
- **Biblioteca de selos**: virou álbum com 3 abas (Municípios/Regiões/
  Rotas — Conquistas saiu daqui, já tem modal próprio) + filtro de
  status (Todos/Conquistados/Faltam via classes `.locked`/`.unlocked`).
  Estado bloqueado padronizado (`filter: brightness(0.2) grayscale(100%)`
  na imagem, sem cadeado amarelo no texto).
- **Placeholder CSS puro** (`.selo-placeholder-box`/`.selo-placeholder-img`
  em `css/styles.css`): círculo com gradiente + emoji via `::after`
  pra qualquer selo/medalha sem arte ainda — a imagem real cobre
  perfeitamente assim que ganha `src`, sem trocar classe.
- **Perfil**: crachá "👑 Membro Desbrava"/"Desbravador" (via
  `souMembroMotoclube()`), dashboard 2x2 (Municípios/Selos Dourados/
  Rotas Concluídas/Regiões), minimapa com cantos arredondados, e só os
  4 selos mais recentes (`renderizarUltimosConquistadosPerfil`) no
  lugar da Biblioteca inteira repetida — com botão "Ver Biblioteca
  Completa" (só no próprio perfil).

**Loja Desbrava** (v0.11.5): e-commerce gamificado, SEM gateway de
pagamento real (`criarPedido` só registra a intenção de compra,
coleção `pedidos`). Catálogo em `produtos`, CRUD só pelo admin
(`UID_DONO`). Produto bloqueado (município da `regraDesbloqueio` não
raspado) aparece em silhueta. Voucher do Motoclube (mensal, não
cumulativo, no valor da assinatura) aplicado no checkout. Frete mockado via ViaCEP.

**3 recursos PRO do Motoclube ligados ao Modo Viagem** (v0.11.3-0.11.4):
Garagem Virtual (até 3 motos, odômetro somado sozinho pela moto
"ativa"), trilha do trajeto salvável como `rotasPersonalizadas`,
resumo + compartilhamento via `<canvas>`.

**Modo Viagem** (v0.11.2, base gratuita pra todos): substituiu o
rastreio em segundo plano (`@capacitor/background-runner`, removido —
exigia `ACCESS_BACKGROUND_LOCATION`, motivo de rejeição na Play
Store) por foreground service explícito
(`@capacitor-community/background-geolocation`), ligado só pelo botão
flutuante acima da bússola.

Firestore com `persistentLocalCache`. Motoclube Desbrava (dicas/lojas,
coleção `motoclubeItens`) e rotas personalizadas (sem selo, coleção
`rotasPersonalizadas`) gratuitos, mesma regra do Plano PRO pra cobrança
futura.
