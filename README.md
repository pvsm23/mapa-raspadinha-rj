# Desbrava

App web (PWA) onde o usuário "raspa" os municípios do Rio de Janeiro no mapa conforme os visita, com progresso salvo no navegador.

> Conteúdo/configuração que ainda falta preencher (textos, imagens, ajustes no Firebase Console): ver [PENDENCIAS.md](PENDENCIAS.md).

## Estrutura do projeto

```
.
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── script.js           # lógica principal do mapa e estado
│   ├── scratch-card.js     # motor genérico de raspadinha (canvas)
│   ├── auth.js             # login com Google (Firebase Authentication)
│   └── firebase-config.js  # chaves do projeto Firebase (SUBSTITUA_AQUI)
├── assets/
│   ├── svg/              # SVG dos 92 municípios (gerado, ver tools/)
│   └── img/selos/        # imagens dos "selos" revelados ao raspar (futuro)
├── assets/icons/desbrava-icone.png  # ícone do app (favicon, PWA, apple-touch-icon)
├── data/
│   ├── rj-municipios.geojson  # fonte geográfica dos municípios do RJ
│   ├── destinos.json          # pontos turísticos por município
│   ├── curiosidades.json      # curiosidade/história por município (reservado, vazio)
│   ├── regioes.json           # 8 regiões de governo do RJ (CEPERJ) -> códigos IBGE
│   └── regioes-resumo.json    # resumo em texto de cada região (reservado, vazio)
├── manifest.json          # manifesto do PWA (instalável)
├── sw.js                  # service worker (cache básico offline)
└── tools/
    ├── geojson-to-svg.js # script que gera assets/svg/rj-municipios.svg
    └── gerar-regioes.js  # script que gera data/regioes.json
```

## Dados do mapa

O SVG dos 92 municípios é gerado a partir de `data/rj-municipios.geojson`
([tbrugz/geodata-br](https://github.com/tbrugz/geodata-br), derivado de dados
do IBGE) via `tools/geojson-to-svg.js`. Para regenerar depois de atualizar o
GeoJSON:

```
node tools/geojson-to-svg.js
```

O resultado (`assets/svg/rj-municipios.svg`) precisa ser colado manualmente
dentro da tag `<svg id="mapa-rj">` em `index.html`.

## Etapas do desenvolvimento

- **Etapa 1**: mapa de teste com 3 municípios como formas geométricas, clique alterna estado visitado/não visitado, progresso salvo no `localStorage`.
- **Etapa 2**: mapa oficial do IBGE com os 92 municípios do RJ, cada um com seu código IBGE real.
- **Etapa 3** (atual): clique num município não visitado abre um modal com a raspadinha real (`scratch-card.js`); só marca como visitado depois de raspar quase tudo (limiar de 92%). A capa raspável usa a arte real em preto e branco (`assets/img/selos/<id>fundo.png`) quando existe, com fallback pro placeholder gerado na hora. A raspadinha em si é estática (sem zoom/mover) — quem ganhou zoom e mover foi o **mapa principal**: ocupa a tela toda, arrasta com o mouse/dedo pra mover e dá zoom com a roda do mouse ou pinça de 2 dedos (duplo clique/toque reseta). Clicar num município já visitado mostra o selo revelado de novo (sem raspar). Botão "Biblioteca de selos" abre uma grade com todos os 92 municípios, cinza os não visitados e coloridos os já raspados.
- **Selos reais**: colocar `assets/img/selos/<código-ibge>.png` (colorido) e `assets/img/selos/<código-ibge>fundo.png` (preto e branco, capa raspável) — sem precisar mexer em código.
- **Item 4**: `data/destinos.json` cobre os 92 municípios com nomes de pontos turísticos, todos já com uma `descricao` curta preenchida (460 pontos no total). Falta só o `textoCompleto` (história/curiosidade mais longa, mostrada ao clicar no destino) e o `linkMaps` de cada um — ver `PENDENCIAS.md`.
- **Etapa 4**: publicação no GitHub Pages.
- **PWA (instalável)**: `manifest.json` + `sw.js` deixam o site instalável como app no celular (Android/iOS, "Adicionar à tela inicial") e no PC (Chrome/Edge mostram um botão de instalar), usando o ícone real do "Desbrava" (`assets/icons/desbrava-icone.png`). O viewport trava o zoom nativo da página (`user-scalable=no`) para não conflitar com o zoom próprio do mapa. O service worker usa estratégia "network-first" (busca a versão mais nova sempre que online, só cai no cache offline) — se precisar forçar uma limpeza de cache antigo em algum dispositivo, é só desinstalar/reinstalar o app ou limpar dados do site.
- **Nome/marca**: o app se chama **Desbrava**. O título "DESBRAVA" (barra de topo e tela de login) usa a fonte "Archivo Black" (Google Fonts), pra combinar com o logo.
- **Layout tela cheia (estilo Google Maps)**: o mapa é o único "fundo" (`position: fixed`, ocupa a tela toda); toda a UI (barra de progresso, botões de biblioteca/configurações, popups) flutua por cima, fixa, sem se mover com o pan/zoom do mapa. Nomes dos municípios aparecem direto no mapa (`tools/geojson-to-svg.js` gera um `<text>` por município). O popup do selo virou o único lugar para ver detalhes/status/data/destinos turísticos e desmarcar (atrás do menu "⋮", com confirmação) — a antiga seção `#detalhes` foi removida. Novo botão de Configurações (⚙️) reúne o reset geral do mapa.
- **Login com e-mail/senha (opcional pra navegar, obrigatório pra interagir) + Analytics**: `js/firebase-config.js` já tem as chaves reais do projeto Firebase `mapa-raspadinha-rj`. Mexer no mapa (arrastar/zoom) não exige login; só pedir login (`exigirLogin()` em `script.js`) quando o usuário tenta abrir um município/região, a biblioteca ou as configurações. No primeiro login, um popup pede um apelido (salvo no Firestore, coleção `usuarios/{uid}`). Sessão dura 30 dias de **inatividade** (renova a cada acesso; só desloga de verdade depois de 30 dias sem abrir o app — ver `CHAVE_ULTIMA_ATIVIDADE` em `js/auth.js`). Login é por e-mail/senha (não Google) porque o domínio do GitHub Pages provavelmente não estava nos "domínios autorizados" do Firebase, exigência específica de provedores OAuth. Números de acesso aparecem em Firebase Console → Analytics (ou [analytics.google.com](https://analytics.google.com), propriedade `G-C5SBMCKN4H`).
  - **Passo pendente**: Console → Authentication → Sign-in method → **Email/senha → Enable** (sem isso, login e cadastro dão erro `auth/operation-not-allowed` — já testei e é exatamente esse o estado atual).
  - **Regra de segurança do Firestore** (Console → Firestore Database → Regras) — sem isso, salvar o apelido (e todo o resto: ranking, amigos, check-in, convites) falha, porque o modo produção bloqueia tudo por padrão. `read` do documento principal fica liberado pra qualquer autenticado (não só o dono) porque a checagem de "apelido já em uso", o Ranking e a busca de Amigos por e-mail/apelido precisam poder consultar os dados de outros usuários; `write` do documento principal continua só no próprio dono. As subcoleções (`convites`, `pedidosAmizade`, `amigos`, `checkins`) usam a mesma ideia — cada uma explicada com um comentário na regra:
    ```
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /usuarios/{uid} {
          allow read: if request.auth != null;

          // Escrita normal (apelido, progresso, estado de municipios/
          // regioes/conquistas, snapshot do mapa, privacidade do
          // perfil etc): qualquer campo, EXCETO "ehPro", que so pode
          // passar de false/inexistente para true numa escrita que
          // tambem inclua o campo "codigoAtivacaoPro" com o valor
          // secreto certo -- e nunca pode voltar a false depois disso
          // (ver PENDENCIAS.md, secao "Plano PRO").
          allow create: if request.auth != null && request.auth.uid == uid;
          allow update: if request.auth != null && request.auth.uid == uid
            && (
              request.resource.data.ehPro == resource.data.get('ehPro', false)
              || (
                request.resource.data.ehPro == true
                && resource.data.get('ehPro', false) != true
                && request.resource.data.get('codigoAtivacaoPro', '') == 'SUBSTITUA_POR_UM_CODIGO_SECRETO_SEU'
              )
            );

          // Convite de amigo -> raspadinha brilhante garantida: quem
          // acabou de criar conta grava aqui (no perfil de quem
          // convidou), com o PRÓPRIO uid como id do documento -- não
          // dá pra "farmar" 2 créditos pro mesmo convidante com a
          // mesma conta. Só o dono (convidante) lê/marca como
          // resgatado.
          match /convites/{novoUid} {
            allow create: if request.auth != null && request.auth.uid == novoUid;
            allow read, update: if request.auth != null && request.auth.uid == uid;
          }

          // Pedido de amizade: quem envia grava na caixa de entrada
          // de quem recebe, com o PRÓPRIO uid como id (pra dar pra
          // cancelar depois). Só o dono lê a lista; dono OU remetente
          // podem apagar (aceitar/recusar OU cancelar o pedido).
          match /pedidosAmizade/{remetenteUid} {
            allow create, delete: if request.auth != null
              && (request.auth.uid == uid || request.auth.uid == remetenteUid);
            allow read: if request.auth != null && request.auth.uid == uid;
          }

          // Lista de amigos: cada lado da amizade só pode escrever a
          // entrada que tem O PRÓPRIO uid como id -- é assim que dá
          // pra ficar mútuo (eu insiro "amigoX" na minha lista E
          // insiro "eu" na lista do amigoX) sem abrir brecha pra
          // inserir terceiros na lista de outra pessoa.
          match /amigos/{amigoUid} {
            allow create, delete: if request.auth != null
              && (request.auth.uid == uid || request.auth.uid == amigoUid);
            allow read: if request.auth != null && request.auth.uid == uid;
          }

          // Check-in semanal: só o dono lê/escreve os próprios dias.
          match /checkins/{semanaId} {
            allow read, write: if request.auth != null && request.auth.uid == uid;
          }
        }

        // Fila de e-mails pro Firebase Extension "Trigger Email"
        // (firestore-send-email) processar -- ver enviarEmailProprio
        // em js/auth.js. Só pode criar um documento mandando e-mail
        // pro PRÓPRIO endereço do usuário logado (nunca pra
        // terceiros, senão qualquer conta virava um jeito de mandar
        // spam usando o projeto); ninguém além da extensão (que roda
        // com privilégio de admin, fora destas regras) lê ou altera
        // depois de criado.
        match /mail/{id} {
          allow create: if request.auth != null
            && request.resource.data.to == [request.auth.token.email];
          allow read, update, delete: if false;
        }

        // Relatos de bug/sugestão do botão 💬 (ver enviarFeedback em
        // js/auth.js) -- só cria, exige login, "tipo" tem que ser um
        // dos dois valores esperados e o texto não pode vir vazio.
        // Só é lido manualmente pelo dono no Console do Firebase (sem
        // tela dentro do app pra isso).
        match /feedback/{id} {
          allow create: if request.auth != null
            && request.resource.data.tipo in ["bug", "sugestao"]
            && request.resource.data.texto is string
            && request.resource.data.texto.size() > 0
            && request.resource.data.texto.size() <= 2000;
          allow read, update, delete: if false;
        }
      }
    }
    ```
- **8 regiões de governo (CEPERJ)**: com o mapa afastado (zoom < 1.8x), os 92 municípios aparecem coloridos pela sua REGIÃO — cinza até todos os municípios dela serem visitados, verde quando a região inteira estiver completa. Clicar num município nessa visão abre o popup da região (`data/regioes.json`, fonte CEPERJ + Lei Complementar 105/2002 pra Costa Verde), com contador, e um "mega-selo" (raspadinha bem maior, 400px) que só fica disponível pra raspar quando a região estiver 100% completa. Espaço reservado pro resumo em texto de cada região em `data/regioes-resumo.json` (vazio, a preencher depois). Zoom máximo foi de 4x pra 10x; nomes dos municípios só aparecem a partir de 3.5x (pra não lotar a tela quando dá pra ver vários de uma vez).
- **Destinos clicáveis**: cada ponto turístico no popup do município agora é clicável, abrindo um texto reservado (`textoCompleto`, ainda não preenchido em nenhum destino) e um botão "▶️ Abrir no Maps" — fica desabilitado até o destino ter um `linkMaps` de verdade em `data/destinos.json`.
- **Animação ao completar a raspadinha**: o selo dá um "pulo" (CSS, `js/scratch-card.js: celebrarConclusao`) e sai confete (`dispararConfete`) tanto no selo de município quanto no mega-selo de região.
- **Dados pessoais (Configurações)**: apelido editável a qualquer momento (não só no primeiro login), com checagem de apelido único — rejeita se outro usuário já estiver usando o mesmo (ver `apelidoEstaDisponivel` em `js/auth.js`, e a regra do Firestore acima). E-mail único já é garantido nativamente pelo Firebase Auth (não dá pra criar duas contas com o mesmo e-mail). **Senha única não é possível nem recomendável**: o Firebase nunca expõe senha (nem hash) de outros usuários pra comparação — se desse, seria uma falha de segurança grave (permitiria descobrir senhas alheias por tentativa e erro).
- **Progresso isolado por conta, mesmo no mesmo navegador** (`chaveComUid`/`carregarEstadoDoUsuario`/`voltarParaEstadoAnonimo` em `js/script.js`, `buscarMeuEstadoCompleto` em `js/auth.js`): correção de um bug real — o progresso local (`estadoMapa`/`estadoRegioes`/`estadoConquistas`/`estadoStreak`) era salvo numa chave de localStorage **fixa**, igual pra qualquer conta; duas contas diferentes no mesmo navegador/computador liam e sobrescreviam o mesmo dado, misturando o progresso de uma pessoa com o de outra. Agora cada chave leva o uid de quem está logado (`_anon` enquanto ninguém logou). Contas que já usavam o app antes migram sozinhas os dados da chave antiga (`migrarEstadoAntigoSeNecessario`, 1x, não apaga a antiga). Além disso, a cada login o app busca `estadoMunicipios`/`estadoRegioes` do **Firestore** (isolado por uid nas regras de segurança, fonte de verdade real) e restaura por cima do local — isso também **corrige sozinho** qualquer mistura que ainda exista no navegador de alguém que já usava o app antes dessa correção.
- **Login em segundo plano (não trava a tela)**: ao clicar em "Entrar"/"Criar conta" com e-mail e senha preenchidos, o popup de login fecha na hora — a chamada ao Firebase roda em segundo plano enquanto o usuário já pode continuar usando o mapa. O andamento aparece num aviso flutuante no canto inferior direito (`#toast-login` em `index.html`/`css/styles.css`, controlado por `mostrarToastLogin`/`atualizarToastLogin` em `js/script.js`): spinner + "Login sendo efetuado..." enquanto aguarda, vira "Login realizado! ✅" por alguns segundos em caso de sucesso, ou uma mensagem de erro em vermelho que fica na tela — clicar nela reabre o popup de login pra tentar de novo. Se o login parecer "travado sem nada acontecer" mesmo assim, o mais provável é estar testando uma versão desatualizada em cache — força um refresh sem cache (Ctrl+Shift+R) ou reinstale o PWA.
- **Zoom sem "puxar" pro meio do mapa**: a roda do mouse ancora o zoom no ponteiro (não mais sempre no centro do mapa), e a pinça de 2 dedos ancora no ponto médio entre os dedos — então dá pra ampliar mantendo o que já estava olhando fixo na tela, mesmo com o mapa arrastado pras bordas (ver `aplicarZoomAncorado` em `js/script.js`).
- **Limite de arrasto**: não dá mais pra arrastar o mapa pra fora da tela por completo — pelo menos 10% da largura/altura do mapa continua visível em qualquer zoom/posição (`limitarDesloc` em `js/script.js`; testado e confirmado matematicamente exato: exatamente 10% de overlap no limite).
- **Spinners de carregamento**: no botão de login (enquanto aguarda o Firebase) e no popup do selo/mega-selo (enquanto a imagem carrega) — evita a sensação de "não carregou" em conexões mais lentas. Selos de todos os municípios são pré-carregados em segundo plano assim que o app abre, pro clique de verdade já achar a imagem no cache do navegador.
- **Botão de compartilhar**: troca o antigo botão de perfil (que só duplicava a função de Configurações) por um de compartilhar o link do app (Web Share API no celular, copia o link como alternativa no desktop).
- **Feedback e colaboração** (botão 💬 na barra de topo, `abrirFeedback`/`enviarFeedback`/`copiarChavePix` em `js/script.js`, `enviarFeedback` em `js/auth.js`): janela com 3 opções — "🐛 Relatar um bug" e "💡 Dar uma sugestão" (gravam na coleção `feedback` do Firestore, exigem login) e "🤝 Colaborar" (mostra uma chave PIX pra copiar, sem exigir login — colaborar é **sempre opcional**, nunca necessário pra usar o app). A chave PIX vem de `CHAVE_PIX_COLABORACAO` no topo de `js/script.js` (ver PENDENCIAS.md).
- **Boas-vindas/tutorial (1a vez)** (`mostrarBoasVindasSeNecessario`/`fecharBoasVindas` em `js/script.js`): mostra, só na primeira vez que o app abre (localStorage), um tutorial curto explicando a intenção do app — incentivar a sair de casa e conhecer municípios de verdade — e os 4 conceitos principais (selos, pontos turísticos, conquistas, selo brilhante). Ao fechar, encadeia direto com o aviso de "em desenvolvimento" logo em seguida (nunca aparecem sobrepostos).
- **Aviso de "app em desenvolvimento"** (`mostrarAvisoDesenvolvimentoSeNecessario` em `js/script.js`): mostra, só na primeira vez que o app abre (controlado por localStorage), um aviso de que o app ainda está em fase de testes, não é a versão oficial final, futuramente estará na Play Store, é e sempre vai ser gratuito, e que dá pra colaborar (nunca obrigatório) pelo botão 💬.
- **Plano PRO (fase 1 — só o distintivo)**: campo `ehPro` em `usuarios/{uid}`; quem tiver `ehPro: true` ganha um selinho "PRO" amarelo do lado do apelido no Ranking (`renderizarLinhaRanking` em `js/script.js`, classe `.badge-pro`). Ainda não existe cobrança nem checkout — é só o distintivo por enquanto. A regra do Firestore acima protege o campo: uma escrita normal nunca consegue mudar `ehPro` (ela sempre entra e sai igual), e a única forma de virar `true` é numa escrita que também mande o código secreto certo — e depois de `true`, fica assim pra sempre (a regra bloqueia qualquer tentativa de reverter). Ver PENDENCIAS.md pra mais detalhes de arquitetura (sem o código em si, que não fica em nenhum arquivo do repositório).
- **Placeholder do recurso PRO (download offline)**: `ehUsuarioPro()` e `baixarDadosOffline()` em `js/script.js` são stubs — sempre retornam "não é PRO" / mostram um aviso "em construção". O botão "Baixar dados offline" já existe em Configurações, mas desabilitado, esperando alguma forma de marcar quem pagou (ex: campo no Firestore).
- **E-mail de boas-vindas** (`enviarEmailProprio` em `js/auth.js`, chamado dentro de `criarContaComEmail`): ao criar conta, enfileira um e-mail de boas-vindas na coleção `mail` do Firestore, pro Firebase Extension **"Trigger Email"** (`firestore-send-email`) processar e enviar de verdade. **Passo pendente**: a extensão em si ainda não está instalada — exige migrar o projeto pro plano Blaze (pay-as-you-go, tem cota gratuita) e configurar um provedor de SMTP (ex: Brevo, plano grátis de 300 e-mails/dia) na hora de instalar (Console → Extensions → buscar "Trigger Email"). Até isso estar configurado, o documento só fica parado na coleção sem nenhum efeito — não quebra o cadastro. A regra do Firestore (acima) só deixa mandar e-mail pro **próprio** endereço do usuário logado, pra essa fila não virar um jeito de mandar spam pra terceiros.
- **Notificações locais** (`dispararNotificacaoLocal`/`sincronizarCheckboxNotificacoes`/`alternarNotificacoes` em `js/script.js`, handler em `sw.js`): toggle em Configurações → Notificações (`#check-notificacoes`) que pede a permissão do navegador e, quando concedida, dispara notificações do sistema pra dois eventos — detectar um município pra raspar (junto com o aviso flutuante de `verificarLocalizacaoAoAbrirApp`) e desbloquear uma conquista (`verificarNovasConquistasDesbloqueadas`, roda a cada mudança de progresso, independente do modal de Conquistas estar aberto). Usa `ServiceWorkerRegistration.showNotification()` (não `new Notification()` direto) porque o Android exige isso; o `sw.js` trata o clique na notificação focando uma aba já aberta ou abrindo uma nova. **Limitação real, não só deste app**: isso é notificação **local**, disparada pelo próprio app enquanto ele está aberto (mesmo minimizado/em outra aba) — não chega com o app 100% fechado. Notificação "de verdade" nesse caso exigiria push de servidor (Firebase Cloud Messaging + Cloud Functions, o que precisa do plano pago Blaze do Firebase) — não implementado.
- **Aviso de instalar o app**: toda vez que o site abre num navegador (não dentro do app já instalado), um aviso flutuante no canto inferior esquerdo sugere instalar o Desbrava (`#aviso-instalar-pwa`). No Chrome/Edge/Android, que suportam instalar com um clique, aparece um botão "⬇️ Instalar" que já dispara o prompt nativo do navegador (evento `beforeinstallprompt`, capturado em `js/script.js`). Nos demais casos (ex: iOS Safari, que não expõe esse evento), aparece um botão "Como instalar" com instruções manuais — específicas pro iOS ("Compartilhar → Adicionar à Tela de Início") ou genéricas pro Chrome (ícone de instalar na barra de endereço, ou menu "⋮" → "Instalar Desbrava"). O aviso não aparece se: o app já estiver rodando instalado (`pwaJaInstalado()`, checa `display-mode: standalone`/`navigator.standalone`); já tiver sido instalado antes por esse navegador (flag `desbrava_pwa_instalado` no localStorage, gravada no evento `appinstalled`); ou o navegador conseguir confirmar sozinho que já está instalado mesmo numa aba comum (`navigator.getInstalledRelatedApps()`, via `related_applications` no `manifest.json` — só existe no Chrome/Edge/Android). **Limitação conhecida**: no Safari/iOS não existe nenhuma API pra saber pela web se o site já foi "Adicionado à Tela de Início" antes — lá o aviso pode reaparecer mesmo já instalado, até a pessoa instalar de fato (o que muda o `display-mode` para `standalone` e passa a contar).

## Gamificação

Ranking, Amigos, Conquistas e Check-in abrem a partir de botões flutuantes fixos na **lateral esquerda da tela**, logo abaixo da barra de topo (`#botoes-lateral-esquerda`), sempre visíveis, separados da barra de topo (que só tem compartilhar/biblioteca/configurações). Tem também uma busca (🔍) no canto inferior direito e o mapa muda de aparência conforme o zoom (ver abaixo).

- **Apelido nunca em formato de e-mail**: `salvarApelido` (`js/auth.js`) rejeita qualquer apelido que pareça um e-mail (`pareceEmail()`, regex simples), pra não confundir com o e-mail de login nem vazar sem querer o e-mail de alguém pelo Ranking/busca de Amigos/perfil público (que mostram o apelido publicamente). Se a pessoa fechar o popup de escolher apelido (primeiro login) sem confirmar nada, gera sozinho um `userNNNNNN` aleatório e salva (`fecharModalApelidoComAleatorio` em `js/script.js`, com nova tentativa automática no raro caso de colisão).
- **Ranking online, com abas Global/Amigos** (`buscarRanking`/`buscarMinhaPosicao`/`listarAmigos` em `js/auth.js`, `abrirRanking`/`carregarRanking` em `js/script.js`): aba "Global" mostra o top 50 de quem visitou mais municípios verificados, com a posição do usuário atual destacada mesmo fora do top 50; aba "Amigos" mostra só você e seus amigos, ordenados por progresso. Clicar num nome abre o perfil público dessa pessoa. Alimentado pelo campo `municipiosVisitadosCount`, sincronizado (`sincronizarProgressoOnline`) toda vez que o progresso muda.
- **Conquistas** (`abrirConquistas`/`DEFINICOES_CONQUISTAS` em `js/script.js`): 24 conquistas de vários tipos, cada uma com sua própria raspadinha (reaproveita `scratch-card.js`) que só libera pra raspar quando a meta é atingida. Percentuais sempre **arredondados pra cima** (`Math.ceil`). Tipos: % de municípios verificados (**Primeiros Passos** = 3 municípios, depois 25/50/75%, 100% = **Desbravador**), sequência de check-ins (**Semana Cheia** = 7 dias seguidos abrindo o app, rastreado localmente em `estadoStreak`), municípios verificados **no mesmo dia** (3/5/8, **Dia Corrido**/**Maratona do Dia**/**Turbo Turista**), regiões completas (1, 25%, 50%, 100%), selos de município brilhantes (1/3/5/10/25/50/100%) e selos de região brilhantes (1/25%/50%/100%). Cada conquista tem um **nível de raridade fixo** (comum → incomum → raro → muito raro → lendário → farmador de aura), classificado por dificuldade — da mais fácil pra mais difícil — e não por quantas contas realmente a têm (campo `raridade` em cada item de `DEFINICOES_CONQUISTAS`).
- **Amigos** (`abrirAmigos` em `js/script.js`): busca por e-mail exato ou apelido exato, envia pedido de amizade, aceita/recusa pedidos recebidos e lista os amigos atuais com quantos municípios cada um já visitou. Clicar num amigo abre o perfil público dele. Amizade é sempre mútua (aceitar grava a entrada dos dois lados numa `writeBatch`).
- **Check-in semanal** (`abrirCheckin` em `js/script.js`, `registrarCheckinHoje` em `js/auth.js`): marca o dia da semana atual (domingo a sábado) num calendário curto (`usuarios/{uid}/checkins/{AAAA-MM-DD}`, chave = data do domingo daquela semana); reseta a cada semana nova. Semanal (não mensal) porque é um app de viagem com poucos acessos espaçados.
- **Raspadinha brilhante** (`decidirBrilhante`/`marcarComoVisitado` em `js/script.js`, efeito em `js/scratch-card.js: adicionarBrilho` + CSS `.selo-brilhante`/`.selo-item-brilhante` em `css/styles.css`): 5% de chance de virar "brilhante" (luz irradiando do selo tipo um sol — raios girando via `repeating-conic-gradient` + brilho pulsante, **e** uma arte dourada separada — ver abaixo) **só na primeira vez que a sorte de cada município é decidida**, no momento em que a raspadinha é aberta (não no final) — depois disso o resultado fica gravado (`chanceDecidida`/`brilhante`) e nunca muda. Municípios raspados **antes** dessa funcionalidade não têm `chanceDecidida` — ganham a decisão na próxima vez que forem raspados (desmarcar e raspar de novo pra tentar a sorte uma única vez). Selos de **região** (mega-selo) têm a mesma mecânica com **10%** de chance (`decidirBrilhanteRegiao`). A animação de raios é **permanente** enquanto o selo for brilhante — aparece de novo toda vez que o selo é reaberto (`visualizarSeloRevelado`), e também na grade da Biblioteca e no mini-perfil (versão menor do mesmo efeito, `.selo-item-brilhante::before`, pra caber vários lado a lado sem invadir o vizinho), não só no instante de raspar.
- **Arte dourada dos selos brilhantes**: quando um selo (de município ou região) é brilhante, o app tenta carregar `<id>dourado.png` (ex: `assets/img/selos/3300100dourado.png`) em vez da arte normal (`resolverImagemColorida` em `js/script.js`) — se esse arquivo não existir ainda, cai na arte normal mesmo brilhando (o sol de raios continua aparecendo do mesmo jeito). Essa é a versão mostrada também no perfil público de quem tiver o selo.
- **Convite de amigo → raspadinha brilhante garantida**: o botão de compartilhar (🔗) abre um popup explicando o bônus antes de compartilhar de fato, e o link inclui `?convite=<uid>` quando logado. Se alguém cria conta por esse link, quem convidou ganha o direito a UMA raspadinha brilhante garantida na próxima vez que raspar (`usuarios/{convidante}/convites/{novoUid}`, ver `creditarConviteSeExistir`/`consumirBoostBrilhante` em `js/auth.js`). Enquanto o boost estiver pendente, um aviso flutuante (`#aviso-brilhante-pendente`, centralizado logo abaixo da barra de topo) avisa "você tem uma raspadinha brilhante te esperando".
- **Curiosidade do município, com janela "Saiba mais" pra história mais longa** (`mostrarCuriosidade`/`abrirHistoriaMunicipio` em `js/script.js`, dados em `data/curiosidades.json`): só aparece **depois** de raspar o selo daquele município. Cada município tem um `resumo` curto (1-3 frases, mostrado direto no popup do selo) e, opcionalmente, uma `historiaCompleta` (lista de parágrafos) — quando ela existe, um botão "📖 Saiba mais" abre uma janela separada (`#modal-historia-municipio`) só com esse texto mais longo (linha do tempo, curiosidades extras etc.), sem lotar o popup principal do selo. Ver [PENDENCIAS.md](PENDENCIAS.md) pra estrutura exata do JSON — Niterói já vem preenchido como exemplo, os outros 91 municípios estão vazios (`resumo`/`historiaCompleta` reservados) esperando o texto.
- **Verificação por localização (GPS)**: raspar um município é sempre permitido, mas só conta de verdade (contador, Ranking, Conquistas, região completa) depois que a geolocalização do navegador confirmar que a pessoa está mesmo dentro dele — comparando as coordenadas contra o contorno geográfico real do IBGE (`data/rj-municipios.geojson`), com um teste de "ponto dentro do polígono" (`pontoDentroDoPoligono`, ray casting clássico). Municípios costeiros têm partes desconectadas (ilhas + continente) gravadas como vários anéis dentro do mesmo Polygon (em vez de um MultiPolygon de verdade); `pontoDentroDoPoligono` trata cada anel como um pedaço separado do território (não como buraco) — conta como dentro se cair em **qualquer** um deles. Enquanto não verificado, o município fica **vermelho** no mapa (não verde), e a biblioteca marca o item com ⚠️. No popup aparece um botão "📍 Verificar agora que estou aqui" pra tentar de novo sem raspar outra vez. Município já verificado nunca perde a confirmação. Municípios raspados antes dessa funcionalidade existir começam como "não verificados" até confirmar.
- **"Onde estou" (📍 localização atual no mapa)**: botão 🧭 no canto inferior direito (acima da busca) pega a localização do navegador, descobre em que município a pessoa está (`encontrarMunicipioPorCoordenada`, reaproveitando o mesmo contorno geográfico da verificação por GPS) e anima o mapa até centralizar e ampliar o local (`window.controleMapa.focarEmMunicipio`), colocando um marcador pulsante (bolinha azul, `colocarMarcadorLocalAtual`) em cima do município — só um "você está aqui", não conta como visita nem abre o selo. Se a pessoa estiver fora do estado do RJ, avisa e não deixa marcador nenhum.
- **Detecção automática ao abrir/reabrir o app** (`verificarLocalizacaoAoAbrirApp` em `js/script.js`): toda vez que o app é aberto (ou volta a ficar visível depois de minimizado/trocar de app, no máximo 1x a cada 2 minutos), confere **silenciosamente** — só se a permissão de localização já tinha sido concedida antes, sem pedir de novo do nada — se a pessoa está dentro de algum município agora. Se estiver num município já raspado mas ainda não confirmado, confirma sozinho; se nunca raspou, mostra um aviso flutuante "📍 Detectamos que você está em X!" com um botão "Raspar selo" que abre o selo direto. **Limitação real da plataforma web, não só deste app**: não existe geofencing em segundo plano pra PWA — nenhum navegador executa JS com o app totalmente fechado (isso exigiria um app nativo com APIs de localização do sistema operacional). Então isso aqui **não** detecta um município por onde a pessoa passou horas atrás enquanto o app estava fechado; só confere a localização atual no exato momento em que o app é aberto/reaberto.
- **Biblioteca de selos completa**: além dos 92 municípios, a biblioteca agora também lista os selos de **região** (mega-selos, cadeado até a região estar completa) e das **conquistas** (cadeado até a meta ser atingida) em seções próprias.
- **Perfil público** (`abrirPerfil` em `js/script.js`, `buscarPerfilPublico`/`definirPerfilPublico` em `js/auth.js`): clicar num nome no Ranking ou na lista de Amigos abre o perfil dessa pessoa — um mini-mapa (verde/vermelho/cinza por município) e a grade de selos dela (com a arte dourada nos brilhantes). O botão 👤 na lateral esquerda abre o **próprio** perfil da mesma forma. Cada usuário pode marcar o próprio perfil como privado em Configurações → Conta (`#check-perfil-publico`); por padrão é público. **Limitação conhecida**: a privacidade é só de exibição no app — o documento em si já é legível por qualquer autenticado (necessário pro Ranking/busca de Amigos), então sem um Cloud Function não dá pra esconder o campo no nível do servidor. Suficiente pra um app hobby.
- **Mini-mapa do perfil = snapshot diário (imagem), não clone ao vivo** (`gerarSnapshotMapaSeNecessario`/`gerarSnapshotMapaComoDataUrl`/`renderizarMiniMapaPerfil` em `js/script.js`, `salvarSnapshotMapa` em `js/auth.js`): a cada login, gera no máximo 1x por dia (controlado por uma data salva no localStorage) uma cópia do SVG do mapa com as cores do estado atual gravadas como atributos (não classes CSS), converte pra PNG via `<canvas>` e grava o data URL resultante no Firestore (`mapaSnapshot`/`mapaSnapshotData`). O perfil só exibe essa imagem (`<img>`), sem clonar o mapa ao vivo — evita a miniatura ficar deslocada/com zoom errado dependendo de como o mapa grande estava no momento em que o perfil foi aberto. Perfis sem snapshot ainda gerado (ex: conta antiga que não abriu o app desde essa mudança) mostram "Mapa ainda não disponível.".
- **Contagem de pessoas por selo**: ao ver um selo de município ou o mega-selo de uma região já revelado, aparece quantas contas têm aquele selo e a % em relação ao total de contas criadas (`contarPessoasComMunicipioVerificado`/`contarPessoasComRegiao`/`contarTotalContas` em `js/auth.js`, calculado na hora via `getCountFromServer` — não mantém contadores separados, então não tem risco de ficar dessincronizado). Não aparece na grade da biblioteca inteira (só no detalhe de cada selo), pra não disparar dezenas de consultas de uma vez.
- **Busca de município/ponto turístico** (`abrirBuscaLocal`/`filtrarBuscaLocal` em `js/script.js`): botão 🔍 no canto inferior direito busca por nome de município ou de ponto turístico; ao escolher um resultado, o mapa anima até centralizar e ampliar o local (`window.controleMapa.focarEmMunicipio`, dentro de `inicializarPanZoomDoMapa`) e, ao terminar a animação, abre o selo — como se tivesse clicado nele direto no mapa.
- **Modo regiões com contorno real**: com o mapa afastado, além de colorir por região, as bordas de cada município individual ficam escondidas (`svg.modo-regioes .municipio { stroke: none }`) e só o contorno de fato de cada região aparece por cima (`construirContornosDeRegiao` em `js/script.js`). Funciona sem nenhuma biblioteca de geometria: lê os vértices reais de cada `<path>` (só retas, formato `M x y L x y ... Z`) e usa um índice espacial pra achar, aresta por aresta, se algum OUTRO município da MESMA região tem vértices bem próximos dos dois extremos dela — se tiver, é fronteira interna (escondida); senão, é litoral, limite do estado ou fronteira com outra região (sempre visível). Substitui uma primeira tentativa por fecho convexo, que "estourava" pra fora da forma real em regiões alongadas/côncavas e cruzava o mapa inteiro com linhas erradas.

## Rodando localmente

Basta abrir `index.html` no navegador, ou servir a pasta com um servidor estático simples.

## Deploy

Publicado via GitHub Pages a partir da branch `main`.
