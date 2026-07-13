# Desbrava

App web (PWA) onde o usuário "raspa" os municípios do Rio de Janeiro no mapa conforme os visita, com progresso salvo no navegador.

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
- **Item 4**: `data/destinos.json` cobre os 92 municípios com nomes de pontos turísticos. Descrição (`descricao`) só está preenchida para 19 municípios (Magé, Mangaratiba, Maricá, Mendes, Mesquita, Miguel Pereira, Miracema, Natividade, Nilópolis, Niterói, Nova Friburgo, Nova Iguaçu, Paracambi, Paraíba do Sul, Paraty, Paty do Alferes, Petrópolis, Pinheiral, Piraí) — os outros 73 têm só o nome do ponto turístico, com `descricao` vazia até serem detalhados.
- **Etapa 4**: publicação no GitHub Pages.
- **PWA (instalável)**: `manifest.json` + `sw.js` deixam o site instalável como app no celular (Android/iOS, "Adicionar à tela inicial") e no PC (Chrome/Edge mostram um botão de instalar), usando o ícone real do "Desbrava" (`assets/icons/desbrava-icone.png`). O viewport trava o zoom nativo da página (`user-scalable=no`) para não conflitar com o zoom próprio do mapa. O service worker usa estratégia "network-first" (busca a versão mais nova sempre que online, só cai no cache offline) — se precisar forçar uma limpeza de cache antigo em algum dispositivo, é só desinstalar/reinstalar o app ou limpar dados do site.
- **Nome/marca**: o app se chama **Desbrava**. O título "DESBRAVA" (barra de topo e tela de login) usa a fonte "Archivo Black" (Google Fonts), pra combinar com o logo.
- **Layout tela cheia (estilo Google Maps)**: o mapa é o único "fundo" (`position: fixed`, ocupa a tela toda); toda a UI (barra de progresso, botões de biblioteca/configurações, popups) flutua por cima, fixa, sem se mover com o pan/zoom do mapa. Nomes dos municípios aparecem direto no mapa (`tools/geojson-to-svg.js` gera um `<text>` por município). O popup do selo virou o único lugar para ver detalhes/status/data/destinos turísticos e desmarcar (atrás do menu "⋮", com confirmação) — a antiga seção `#detalhes` foi removida. Novo botão de Configurações (⚙️) reúne o reset geral do mapa.
- **Login com e-mail/senha (opcional pra navegar, obrigatório pra interagir) + Analytics**: `js/firebase-config.js` já tem as chaves reais do projeto Firebase `mapa-raspadinha-rj`. Mexer no mapa (arrastar/zoom) não exige login; só pedir login (`exigirLogin()` em `script.js`) quando o usuário tenta abrir um município/região, a biblioteca ou as configurações. No primeiro login, um popup pede um apelido (salvo no Firestore, coleção `usuarios/{uid}`). Sessão dura 30 dias de **inatividade** (renova a cada acesso; só desloga de verdade depois de 30 dias sem abrir o app — ver `CHAVE_ULTIMA_ATIVIDADE` em `js/auth.js`). Login é por e-mail/senha (não Google) porque o domínio do GitHub Pages provavelmente não estava nos "domínios autorizados" do Firebase, exigência específica de provedores OAuth. Números de acesso aparecem em Firebase Console → Analytics (ou [analytics.google.com](https://analytics.google.com), propriedade `G-C5SBMCKN4H`).
  - **Passo pendente**: Console → Authentication → Sign-in method → **Email/senha → Enable** (sem isso, login e cadastro dão erro `auth/operation-not-allowed` — já testei e é exatamente esse o estado atual).
  - **Regra de segurança do Firestore** (Console → Firestore Database → Regras) — sem isso, salvar o apelido falha (modo produção bloqueia tudo por padrão). `read` fica liberado pra qualquer autenticado (não só o dono) porque a checagem de "apelido já em uso" (ver abaixo) precisa poder consultar os apelidos de outros usuários; `write` continua só no próprio documento:
    ```
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /usuarios/{uid} {
          allow read: if request.auth != null;
          allow write: if request.auth != null && request.auth.uid == uid;
        }
      }
    }
    ```
- **8 regiões de governo (CEPERJ)**: com o mapa afastado (zoom < 1.8x), os 92 municípios aparecem coloridos pela sua REGIÃO — cinza até todos os municípios dela serem visitados, verde quando a região inteira estiver completa. Clicar num município nessa visão abre o popup da região (`data/regioes.json`, fonte CEPERJ + Lei Complementar 105/2002 pra Costa Verde), com contador, e um "mega-selo" (raspadinha bem maior, 400px) que só fica disponível pra raspar quando a região estiver 100% completa. Espaço reservado pro resumo em texto de cada região em `data/regioes-resumo.json` (vazio, a preencher depois). Zoom máximo foi de 4x pra 10x; nomes dos municípios só aparecem a partir de 3.5x (pra não lotar a tela quando dá pra ver vários de uma vez).
- **Destinos clicáveis**: cada ponto turístico no popup do município agora é clicável, abrindo um texto reservado (`textoCompleto`, ainda não preenchido em nenhum destino) e um botão "▶️ Abrir no Maps" — fica desabilitado até o destino ter um `linkMaps` de verdade em `data/destinos.json`.
- **Animação ao completar a raspadinha**: o selo dá um "pulo" (CSS, `js/scratch-card.js: celebrarConclusao`) e sai confete (`dispararConfete`) tanto no selo de município quanto no mega-selo de região.
- **Dados pessoais (Configurações)**: apelido editável a qualquer momento (não só no primeiro login), com checagem de apelido único — rejeita se outro usuário já estiver usando o mesmo (ver `apelidoEstaDisponivel` em `js/auth.js`, e a regra do Firestore acima). E-mail único já é garantido nativamente pelo Firebase Auth (não dá pra criar duas contas com o mesmo e-mail). **Senha única não é possível nem recomendável**: o Firebase nunca expõe senha (nem hash) de outros usuários pra comparação — se desse, seria uma falha de segurança grave (permitiria descobrir senhas alheias por tentativa e erro).
- **Login em segundo plano (não trava a tela)**: ao clicar em "Entrar"/"Criar conta" com e-mail e senha preenchidos, o popup de login fecha na hora — a chamada ao Firebase roda em segundo plano enquanto o usuário já pode continuar usando o mapa. O andamento aparece num aviso flutuante no canto inferior direito (`#toast-login` em `index.html`/`css/styles.css`, controlado por `mostrarToastLogin`/`atualizarToastLogin` em `js/script.js`): spinner + "Login sendo efetuado..." enquanto aguarda, vira "Login realizado! ✅" por alguns segundos em caso de sucesso, ou uma mensagem de erro em vermelho que fica na tela — clicar nela reabre o popup de login pra tentar de novo. Se o login parecer "travado sem nada acontecer" mesmo assim, o mais provável é estar testando uma versão desatualizada em cache — força um refresh sem cache (Ctrl+Shift+R) ou reinstale o PWA.
- **Zoom sem "puxar" pro meio do mapa**: a roda do mouse ancora o zoom no ponteiro (não mais sempre no centro do mapa), e a pinça de 2 dedos ancora no ponto médio entre os dedos — então dá pra ampliar mantendo o que já estava olhando fixo na tela, mesmo com o mapa arrastado pras bordas (ver `aplicarZoomAncorado` em `js/script.js`).
- **Limite de arrasto**: não dá mais pra arrastar o mapa pra fora da tela por completo — pelo menos 10% da largura/altura do mapa continua visível em qualquer zoom/posição (`limitarDesloc` em `js/script.js`; testado e confirmado matematicamente exato: exatamente 10% de overlap no limite).
- **Spinners de carregamento**: no botão de login (enquanto aguarda o Firebase) e no popup do selo/mega-selo (enquanto a imagem carrega) — evita a sensação de "não carregou" em conexões mais lentas. Selos de todos os municípios são pré-carregados em segundo plano assim que o app abre, pro clique de verdade já achar a imagem no cache do navegador.
- **Botão de compartilhar**: troca o antigo botão de perfil (que só duplicava a função de Configurações) por um de compartilhar o link do app (Web Share API no celular, copia o link como alternativa no desktop).
- **Placeholder do recurso PRO**: `ehUsuarioPro()` e `baixarDadosOffline()` em `js/script.js` são stubs — sempre retornam "não é PRO" / mostram um aviso "em construção". O botão "Baixar dados offline" já existe em Configurações, mas desabilitado, esperando alguma forma de marcar quem pagou (ex: campo no Firestore).
- **Aviso de instalar o app**: toda vez que o site abre num navegador (não dentro do app já instalado), um aviso flutuante no canto inferior esquerdo sugere instalar o Desbrava (`#aviso-instalar-pwa`). No Chrome/Edge/Android, que suportam instalar com um clique, aparece um botão "⬇️ Instalar" que já dispara o prompt nativo do navegador (evento `beforeinstallprompt`, capturado em `js/script.js`). Nos demais casos (ex: iOS Safari, que não expõe esse evento), aparece um botão "Como instalar" com instruções manuais — específicas pro iOS ("Compartilhar → Adicionar à Tela de Início") ou genéricas pro Chrome (ícone de instalar na barra de endereço, ou menu "⋮" → "Instalar Desbrava"). O aviso não aparece se: o app já estiver rodando instalado (`pwaJaInstalado()`, checa `display-mode: standalone`/`navigator.standalone`); já tiver sido instalado antes por esse navegador (flag `desbrava_pwa_instalado` no localStorage, gravada no evento `appinstalled`); ou o navegador conseguir confirmar sozinho que já está instalado mesmo numa aba comum (`navigator.getInstalledRelatedApps()`, via `related_applications` no `manifest.json` — só existe no Chrome/Edge/Android). **Limitação conhecida**: no Safari/iOS não existe nenhuma API pra saber pela web se o site já foi "Adicionado à Tela de Início" antes — lá o aviso pode reaparecer mesmo já instalado, até a pessoa instalar de fato (o que muda o `display-mode` para `standalone` e passa a contar).

## Rodando localmente

Basta abrir `index.html` no navegador, ou servir a pasta com um servidor estático simples.

## Deploy

Publicado via GitHub Pages a partir da branch `main`.
