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
(rastreio só em primeiro plano, ligado à mão pelo usuário).

**Os 26 estados + DF já estão no mapa** (desde a v0.26.08.18.95),
navegáveis município a município na mesma qualidade do RJ -- mas só o
RJ é PUBLICADO. Nos outros dá pra explorar o mapa e nada mais: não
raspa, não conta progresso. Cada um ganha conteúdo e é publicado
separadamente (ver "Expansão por estado" abaixo).

Regras fixas:
- **Versão** (`VERSAO_APP` em `js/script.js` + `versionCode`/
  `versionName` em `android/app/build.gradle`, sempre os três juntos):
  formato **`0.ano.mês.dia.contagem`** desde 12/08/2026 — ex.
  `0.26.08.12.77`. Ano/mês/dia com dois dígitos; o `0` da frente marca
  que a versão oficial ainda não saiu. A **contagem é o `versionCode`**,
  que sobe de 1 por entrega — ele já era o número de versões do app
  desde antes de existir release, e reusá-lo evita um segundo contador
  pra desencontrar do primeiro.
  - Formato antigo (`0.11.45`, "sobe só o último dígito") valeu até a
    v0.11.45 e ainda aparece nos releases publicados. A `0.12.08.26.76`
    é a única com dia na frente, de uma ordem que durou uma entrega.
  - `ehVersaoMaior` ordena pela **contagem**, não pela data. Ela é o
    único campo que só cresce: comparar data não resolve porque a
    comparação varre só os três primeiros campos (`0`, ano, mês) e o
    DIA fica de fora — duas entregas do mesmo mês empatariam. O caminho
    antigo (3 campos) continua no arquivo só pra quem ainda tem
    `0.11.x` instalado.
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

**Cinco projetos Apps Script**, cada um SEPARADO (o `doPost` roteia por
`tipo` e eles brigariam entre si; e a URL do de feedback está no repo
público, onde endpoint de pagamento não pode ficar). Nenhum segredo nos
arquivos — tudo em Propriedades do script. Publicar de novo é passo
manual do Paulo; alterar o `.gs` aqui não muda nada até ele republicar.
- `apps-script-feedback.gs` — feedback, fotos da Comunidade no Drive e
  o acesso público delas (`acesso-foto-post`, `excluir-foto-post`).
- `apps-script-gerar-cobranca.gs` — cobrança Pix do Motoclube.
- `apps-script-clima.gs` — gatilho de 30 min que busca o clima dos 92
  municípios no Open-Meteo e grava UM documento no Firestore (o app lê
  esse documento em vez de falar com a API).
- `apps-script-asaas.gs` — webhook do pagamento.
- `apps-script-limpar-arquivo.gs` — gatilho DIÁRIO que apaga o arquivo
  de banimento vencido. Sem ele o "arquivo de 90 dias" vira "pra
  sempre".

Os que falam com o Firestore precisam do escopo `datastore` declarado à
mão no `appsscript.json` — o Apps Script só adivinha escopo pelo código,
e como lá só aparece `UrlFetchApp` ele deixa o Firestore de fora e a
chamada falha com `403 ACCESS_TOKEN_SCOPE_INSUFFICIENT`.

## Última funcionalidade (v0.26.08.18.100 a v0.26.08.19.103)

**Roteiro: monta no mapa e parte de onde você está** (v0.26.08.19.103).

- **A viagem começa na POSIÇÃO ATUAL**, não no primeiro ponto. Ninguém
  nasce no destino, e sem isso o km ignorava o trecho de casa até lá: no
  teste, 223 km viraram 449. GPS negado não bloqueia — parte do primeiro
  ponto e a tela DIZ isso, em vez de entregar número menor calado.
- **Modo "escolher no mapa"**: a UI toda some (`body.escolhendo-roteiro`
  esconde barra inferior, `#barra-topo`, busca, modos e "onde estou"),
  ficam só a seta no canto e a barra do contador. Os pontos aparecem em
  QUALQUER zoom — a classe `.escolhendo` no SVG força isso, sem tocar em
  `.mostrar-pontos`, que é do zoom: mexer nela exigiria um evento de zoom
  pra devolver o controle, e sem ele os pontos ficariam acesos pra sempre.
  Cada toque põe/tira, com número da ordem e anel verde.
- Confirmar leva à lista editável (↑ ↓ ✕) e só então ao cálculo.
- **Menos de 2 pontos navegáveis agora EXPLICA** em vez de mostrar
  número. Antes o código mantinha a medida com o desvio fantasma: um
  roteiro com a Ilha Grande exibia 357 km de estrada até uma ilha. Achado
  comparando com/sem GPS — o valor com GPS estava MENOR, o que não fazia
  sentido, e foi isso que denunciou.

**Garagem: lista → detalhe** (v0.26.08.19.103). Eram 3 abas
(Nova/Editar/Estatísticas), que obrigavam a escolher a ABA antes da MOTO
-- ao contrário de como se pensa. Abre na lista, o **+ fica no canto
superior direito**, e tocar numa moto mostra odômetro, viagens, consumo
e as ações (Definir como ativa · Editar · Excluir). Moto sem consumo
informado exibe a **faixa deduzida pela cilindrada**, explicando de onde
vem a estimativa do Roteiro em vez de deixar um traço mudo.

**BUG CORRIGIDO — motos duplicadas** (v0.26.08.19.103). Não era a
exclusão: `migrarGaragemAntigaSeNecessario` (js/auth.js) checa se o doc
pai ainda tem `marca` e, se tiver, cria uma moto na subcoleção nova --
mas **nunca apagava os campos antigos**. A condição ficava verdadeira
pra sempre e cada abertura da Garagem criava outra moto, o que dava os
dois sintomas de uma vez: duplicadas aparecendo sozinhas e exclusão que
"não funcionava" (a migração recriava na abertura seguinte). Agora a
migração apaga os campos com `deleteField()` depois de copiar. O
odômetro não se perde: já era copiado pra moto nova, e é lá que
`somarOdometroGaragem` escreve. **Duplicadas já existentes não somem
sozinhas** — precisam ser apagadas à mão uma vez.

**Motoclube virou TELA, não modal** (v0.26.08.19.102): era um painel
sobreposto ao mapa. Agora `#motoclube-view` é irmão do `#mapa-viewport`
e os dois se revezam — entrar esconde o mapa de verdade. Os flutuantes
(bússola, FAB do Modo Viagem, barra de progresso) somem via
`body.em-motoclube`; a barra inferior fica, porque é por ela que se
troca de tela.
- **Duas saídas** porque a barra não tem mais botão "Mapa" (ele saiu
  antes, o mapa é o fundo da tela): a seta do header e tocar em
  "Motoclube" de novo. A seta volta ao grid se houver painel aberto,
  e só então ao mapa.
- **Grid de 5 cards**: Modo Viagem (com interruptor, em linha inteira
  porque controle de ligar/desligar não divide largura), Mapas Offline,
  **Pontos de Apoio**, Garagem e Roteiros. Tocar num card abre o painel
  no lugar do grid.
- **Hero em CSS puro** (faixas diagonais + brilho verde + fio dourado
  na base): sem arquivo de imagem, sem peso no APK, e acompanha o tema.
  Trocar por foto depois é mexer só no `#motoclube-hero`.
- **Paywall é vitrine**: quem não assina vê a tela inteira, os 5 cards
  legíveis mas apagados com cadeado, o selo vira "BLOQUEADA" e o convite
  com o botão do Pix aparece acima. Esconder faria a pessoa não
  descobrir o que está comprando.
- A **Garagem saiu do Menu** — virou card. Ter dois caminhos pra mesma
  tela só duplicava manutenção.

**"Pontos de Apoio"** é o nome das indicações do Motoclube (era "lojas").
É o termo que motociclista usa pra parada de confiança na estrada, e
cobre o que a coleção tem de verdade: oficina, loja, restaurante, dica.

**Roteiro reescrito: a viagem que a PESSOA monta** (v0.26.08.19.102). A
primeira versão gerava o roteiro a partir de uma rota temática, e isso
estava errado de conceito — Rotas (com selo) são coleções pra completar
ao longo do tempo, não trajeto pra rodar num dia. **Não há ligação entre
Rotas e Roteiros.**
- Duas portas: o chip **"+ Roteiro"** na folha do ponto (vira "No
  roteiro" em verde quando já está dentro) e o seletor da tela de
  Roteiros — município + caixas de marcação.
- O chip só aparece pra membro e **só em ponto com coordenada**: sem
  lat/lon não há como navegar, e o botão viraria promessa não cumprida.
- O seletor lista só os **85 municípios que têm ponto navegável**;
  oferecer os outros levaria a uma lista vazia depois do clique.
- **A ordem é a da viagem**, então cada ponto tem ↑ ↓ e ✕. Sem isso,
  trocar dois lugares exigiria apagar tudo e recomeçar.
- Rascunho no `localStorage` (`desbrava_roteiro`), como
  `"<municipioId>:<indice>"`: é decisão de viagem, muda o tempo todo e
  não precisa sincronizar entre aparelhos pra funcionar.
- O cálculo (OSRM, detecção de ponto sem estrada, links, faixa de
  combustível) foi reaproveitado inteiro — só a ENTRADA mudou.

**Roteiros do Motoclube** (v0.26.08.19.101): o app mostrava ONDE ir e
não COMO ir — quem queria rodar uma rota abria o Maps na mão, ponto por
ponto, sem ideia de quanto gastaria de combustível. E as três telas do
motociclista eram modais separados que não conversavam: a moto da
Garagem não servia pra nada além do odômetro.

- **Motoclube virou guarda-chuva**, com abas `.social-aba` (o padrão do
  Ranking/Biblioteca): **Garagem · Lojas · Roteiros**. O `#modal-garagem`
  deixou de existir; quem abria ele cai na aba. As lojas só são buscadas
  quando a aba delas abre — abrir na Garagem não deve custar uma leitura
  do Firestore que ninguém pediu.
- **Distância e tempo vêm do OSRM público** (`router.project-osrm.org`,
  sem chave, CORS liberado). Sem rede, cai em haversine × 1.3 e o aviso
  muda de texto pra dizer que ali é LINHA RETA.
- **Waze não faz rota com paradas** — o esquema de URL leva a um destino
  só. Por isso: Google Maps com as paradas (limite público de 9, e acima
  disso quebra em trechos), Waze por ponto.
- **Ponto sem acesso rodoviário sai da MEDIÇÃO, não só da navegação.**
  O OSRM gruda o ponto na estrada mais próxima e devolve o quanto
  arrastou (`waypoints[].distance`); acima de 2 km é ilha/trilha. Vila
  do Abraão deslocava 9,8 km, e a Rota do Caminho do Ouro dava **405 km
  em vez de 258** — 147 km fantasmas que viravam ~40% de combustível a
  mais. Detectado, o trajeto é remedido sem esses pontos.
- **Só 45% dos pontos turísticos têm lat/lon** (207 de 456). O roteiro
  usa os localizáveis e DIZ quantos ficaram de fora. Não é limitação
  temporária escondida: é o número na tela.
- **Aviso de fase de testes fixo ACIMA dos números**, e todo valor sai
  com "~" ou "≈". Estimativa de rota com cara de dado exato é o tipo de
  coisa que faz alguém sair com combustível a menos.
- Tudo atrás de `souMembroMotoclube()`. Não-membro vê o paywall, e
  nenhum número ou link vaza.

**Consumo pela cilindrada, sem tabela de modelos** (v0.26.08.19.101): a
moto ganhou `consumoKmL` (campo opcional), mas o normal é o app deduzir.
Quase toda moto vendida aqui traz a cilindrada NO NOME — o dado já está
no campo Modelo, então não precisou de campo novo nem de uma tabela de
centenas de modelos que seria impossível manter sem inventar número.
- `cilindradaDoModelo` lê o nome; `FAIXAS_CONSUMO` dá km/l por classe.
- **Armadilha do abreviado**: "R15" é 150cc, não 15. Número entre 10 e
  49 vira dezena (×10), mas SÓ quando não houver nenhum número já
  plausível no nome.
- Faixa de 50 a 1800 cc descarta ANO ("CG 160 2023" → 160, não 2023).
- **Um dígito só fica em BRANCO de propósito** (MT-03, R1, XJ6): "03"
  pode ser 300 e "01" pode ser 1000, e chutar vira litro errado na conta
  de quem vai viajar.
- Sai **faixa**, nunca número único ("≈ 6 a 8 L") — a mesma moto varia
  mais de 30% entre cidade, estrada e serra. Consumo informado à mão
  vence a dedução e aí sim sai valor único.
- **Preço de combustível não existe no app**, e é decisão, não falta:
  varia por estado, bandeira e semana, e não há fonte grátis confiável
  no Brasil. Litro cada um converte com o preço do posto dele.

**Garagem virou lista** (v0.26.08.19.101): as até 3 motos aparecem todas
de uma vez, com distintivo da marca (iniciais sobre gradiente estável,
mesma técnica do `corAvatar`), **modelo em destaque** e estrela na ativa.
Substituiu o "card seletor" de uma moto por vez com setas — com no
máximo 3 motos, esconder duas economizava espaço que não precisava ser
economizado. **Não são as logos oficiais de propósito**: logo de
fabricante é marca registrada, e empacotar as artes num app da Play
Store é risco jurídico por ganho estético.

**"Rotas" x "Roteiros"**: as 24 rotas com selo MANTIVERAM o nome. Todas
se chamam "Rota do…", têm página `guia/rota-*.html` com canonical e
estão no `sitemap.xml` recém-publicado no domínio novo — renomear jogaria
fora o indexamento que acabou de começar. A funcionalidade nova é
*Roteiro*, que em português é o itinerário planejado de uma viagem.

**Domínio próprio** (v0.26.08.18.100): o site saiu de
`pvsm23.github.io/mapa-raspadinha-rj` e virou **desbravaapp.com.br**
(GitHub Pages, 4 registros A + CNAME do www no registro.br, sem tocar
em MX/SPF/DKIM/DMARC). O endereço antigo continua vivo por
REDIRECIONAMENTO do Pages — e isso importa porque o `SITE_PUBLICADO` vai
DENTRO do APK: quem tem versão antiga instalada segue apontando pro
endereço velho, e é o redirecionamento que mantém o download de mapa
estadual funcionando. `desbravaapp.com.br` foi adicionado aos domínios
autorizados do Firebase Auth (sem isso o login quebraria) e o Netlify
foi aposentado.

**Apagar e denunciar comentário** (v0.26.08.18.100): faltavam as duas
saídas no comentário, e pelo mesmo motivo — a regra do Firestore já
permitia, mas não existia botão. Autor apaga o próprio (post e
sugestão); os demais denunciam, fechando a quarta e última superfície
pública sem denúncia. Três coisas entraram junto porque deixariam o
recurso pela metade: o contador tinha DUAS fontes de verdade (o objeto
`post` e o span) e o próximo envio reescrevia o número velho; o
comentário recém-enviado nascia sem botão por não ter id (agora
`comentarPost`/`comentarSugestao` devolvem o id); e o botão caía na
última linha em comentário de duas linhas, porque `float` encontrado
depois do texto desce (40px de queda contra 6px dos vizinhos) — passou a
ser inserido antes do texto.

## Anterior: Brasil inteiro e moderação (v0.26.08.17.89 a v0.26.08.18.99)

**Moderação: denúncia, banimento e arquivo** (v0.26.08.18.99). Não
existia NADA disso: busca por "denunciar/reportar/abuso" no app dava
zero, a regra do Firestore só deixava o AUTOR apagar (nem o dono), e
banir a conta não tirava o conteúdo dela do ar. Alguém postava algo
impróprio e a única saída era o Console do Firebase.
- Denúncia em post, sugestão e comentário de ponto turístico. O menu
  "⋮" do post existia só pro autor; agora aparece pra todos — autor
  apaga, os demais denunciam. É PRIVADA: só o dono lê, e ninguém
  descobre quem denunciou (senão denunciar vira risco pra quem
  denuncia).
- Id do documento = `<tipo>_<conteudo>_<uid>`, o que dá "uma denúncia
  por pessoa por conteúdo" sem precisar de contador. Fila no painel de
  Admin, com o caminho do Firestore traduzido (`posts/abc` → "Post").
- **3 denúncias aceitas = banimento automático.** O contador
  (`denunciasAceitas`) vive no doc da conta, e não somando denúncias na
  hora: denúncia resolvida sai da fila, e contar depois daria número
  errado.
- **Arquivo de 90 dias**: banimento automático erra, então o conteúdo
  vai pra `arquivoBanimento/{uid}/itens` em vez de ser destruído. O
  campo `caminhoOriginal` guarda o caminho completo, então o recurso
  devolve cada item ao lugar exato (o comentário renasce no mesmo
  post). Vencido o prazo, `tools/apps-script-limpar-arquivo.gs`
  (gatilho diário, 4º projeto Apps Script) apaga de vez.
- As fotos NÃO são apagadas, mas têm o acesso público revogado na hora
  (ação `acesso-foto-post` no `apps-script-feedback.gs`): o id do Drive
  continua o mesmo, então o recurso religa o mesmo link. **Ressalva**:
  o `lh3.googleusercontent.com` é CDN e guarda cache — o corte não é
  instantâneo pra quem já tinha carregado.
- **Armadilha das regras**: restaurar = o DONO gravar um documento cujo
  `autorUid` é de outra pessoa, e todo `create` exigia
  `autorUid == request.auth.uid`. Por isso 6 `create` e 7 `delete`
  ganharam `|| ehDono()`. No comentário de ponto turístico o `ehDono()`
  é alternativa ao bloco INTEIRO, não só ao autorUid, porque ele também
  exige GPS verificado — que a pessoa não tem como refazer meses depois.
  E `denunciasAceitas` entrou no `hasOnly` do dono: sem isso o banco
  recusa o contador e o banimento nunca dispara.

**Indicar selo** (v0.26.08.18.99): município sem arte própria mostra
selo desenhado na hora; quem já confirmou presença por GPS ali pode
mandar uma foto candidata (`selosIndicados/{municipioId}/itens/{uid}` —
o uid como id do doc dá "uma por pessoa por município" de graça), com as
regras na tela (sem pessoas, sem propaganda, sem estabelecimento
particular) e revisão no Admin. A detecção reusa o `arteReal` do
`resolverImagemColorida`, o mesmo caminho que decide desenhar o selo.
A foto **não vira selo sozinha**: a arte é arquivo do repo que vai
dentro do APK, então publicar continua passando por
`tools/processar-selos.js` e um commit.

**O Brasil inteiro no mapa** (v0.26.08.18.95): 27 UFs, **5.601
divisões** — a conta bate na unidade com o IBGE (5.570 municípios, +32
do DF que entra com 33 Regiões Administrativas no lugar de 1, −1 de
Fernando de Noronha). Os 26 mapas somam ~17 MB comprimidos e ficam
**fora do APK**, que segue em 20,5 MB (`FORA_DO_APK` em
`tools/montar-www.js`).
- Cada estado é `emDesenvolvimento: true` em `data/estados.json` + o par
  `assets/svg/<uf>-municipios.svg`. Nenhum precisou de código próprio.
- **DF**: tem UM município, então a API de malhas devolvia uma mancha
  só. As divisões reais são as RAs, que o IBGE classifica como
  *subdistritos* — e a API não serve isso (a v3 aceita só mesorregiao/
  microrregiao/municipio; a v2 devolve a mesma feature). A geometria só
  existe nos shapefiles do geoftp, daí `tools/shapefile-para-geojson.js`
  (leitor de .shp/.dbf sem dependência). Duas armadilhas achadas ali: o
  IBGE usa **PolygonM (tipo 25)**, não Polygon (5) — filtrar por 5
  devolve zero feature; e a codificação varia por arquivo (2010 é
  latin1, 2022 é UTF-8), então lê o `.cpg`.
- **Ilhas oceânicas distantes saem do desenho**: Trindade esticava a
  caixa do ES de 2,2° pra 13° e achatava o estado. A regra é por
  PROXIMIDADE DO CONTINENTE — a primeira versão media distância até a
  mediana dos centros, o que mede TAMANHO do estado, não isolamento, e
  apagou 355 anéis de Minas, que nem litoral tem. Município 100%
  oceânico sai inteiro (Fernando de Noronha), **rótulo junto**: sem isso
  sobrava um `<path d="">` indexado pela lupa e um nome solto fora do
  mapa.
- **Modo regiões só entra se o estado TIVER regiões** — o DF não tem, e
  o mapa afastado dele virava uma mancha cinza sem divisa.

**A UI do app continua nos outros estados** (v0.26.08.18.93/94): o mapa
estadual era um modal em tela cheia por cima de tudo, então entrar em SP
apagava o app inteiro. Agora o `#estado-viewport` é irmão do `#mapa-rj`
dentro do mesmo `#mapa-viewport` e os dois se revezam — a UI já flutuava
por cima do mapa, então não precisou duplicar nada.
- Conteúdo é **por estado ativo**, e a chave são os 2 primeiros dígitos
  do código IBGE (33 = RJ, 31 = MG): post, produto e selo já guardam o
  código do município, então dá pra saber o estado sem campo novo nem
  migração. Conquistas, Rotas, Loja e Biblioteca mostram aviso de "em
  desenvolvimento"; a Comunidade filtra pelo estado ativo; o Ranking
  ganhou aba com a **SIGLA** (não o nome — "Rio Grande do Sul" estoura a
  aba). A bússola fora do estado ativo diz onde a pessoa está.
- **O RJ não é mais "o padrão"** — é o único publicado, e todos terão o
  mesmo peso. Nada no código pergunta "é o RJ?"; pergunta "este estado
  está publicado?" (`emEstadoLimitado()`, `SIGLA_MAPA_EMBUTIDO` lido do
  DOM em vez de fixo no código).

**Rótulo por município** (v0.26.08.18.96/97): nome de município gigante
ficava minúsculo e só aparecia com muito zoom. Eram duas falhas — teto
de fonte fixo em 4, e um limiar único (zoom 7) sendo que 86,8% já
caberiam antes. A **primeira correção estava errada e o mapa denunciou**:
premiava NOME CURTO (Ubá antes de Patos de Minas). Agora o TAMANHO
decide quando, e a fonte é a maior que couber — nome comprido custa
letra menor, não atraso na fila. `FAIXAS_ROTULO`/`ZOOM_ROTULO_ESTADUAL`
são os mesmos 5 valores nos dois lados e precisam mudar juntos.

**Mapa estadual se atualiza sozinho** (v0.26.08.18.98): o
`CACHE_OFFLINE` nunca é limpo (é o que evita perder o download a cada
deploy), então mapa já baixado ficava CONGELADO — o Paulo teve que
apagar e rebaixar à mão pra ver os rótulos novos. Agora cada mapa tem
uma impressão digital (`data/mapas-estaduais.json`, gerada no build) e o
app confere em segundo plano, rebaixando só o que mudou.
- **A primeira versão não funcionava**: o `sw.js` trata `.svg` como
  imagem e responde com `caches.match`, que varre TODOS os caches —
  inclusive o que tem a cópia velha. O rebaixe devolvia a mesma coisa. A
  busca leva `?v=<hash>` só pra a URL diferir; a gravação continua na
  chave limpa, senão o download não seria reencontrado.

**Login deixou de ser exigido pra LER** (v0.26.08.18.99):
Configurações, painel do município e Loja abrem sem conta. O portão foi
pra ação: raspar e comprar continuam exigindo login. Não bastava
esconder o botão — sem tratar, o canvas era criado e a pessoa raspava de
verdade, gravando num localStorage sem UID.

**Modal "Mapa do Brasil" híbrido**: o SVG tinha `min-width: 520px` +
`overflow-x: auto`, obrigando a ARRASTAR o país dentro de um modal no
celular. Era deliberado — sem o zoom, RJ e SE viram alvos de 6 px. Agora
o mapa é leitura (cabe inteiro) e a ação vai pra uma lista de cards:
**RJ no mapa tem 26×18 px; no card, 293×63**.

## Expansão por estado

O Paulo publica **um estado por vez**: malha (feito pros 27), depois
histórico/curiosidades, depois selos — e só então sai de "em
desenvolvimento". Quando publicar, cada estado terá **progresso,
conquistas e rotas próprios**, e o ranking terá aba por estado + geral.
O Modo Clima hoje só existe pros 92 do RJ, mas cada estado terá o seu.
Não tratar nada disso como "coisa do RJ" em definitivo.

## Anterior: pagamento do Motoclube (v0.11.21 a v0.11.24)

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
