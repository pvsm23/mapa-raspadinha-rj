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
│   └── destinos.json          # pontos turísticos por município (parcial)
├── manifest.json          # manifesto do PWA (instalável)
├── sw.js                  # service worker (cache básico offline)
└── tools/
    └── geojson-to-svg.js # script que gera assets/svg/rj-municipios.svg
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
- **Login com Google obrigatório + Analytics**: `js/firebase-config.js` já tem as chaves reais do projeto Firebase `mapa-raspadinha-rj`. `#tela-login` cobre o app inteiro até o usuário logar (sem login, sem acesso). No primeiro login, um popup pede um apelido (salvo no Firestore, coleção `usuarios/{uid}`) — esse apelido (não o nome do Google) é o que aparece no app dali em diante. Usa `signInWithRedirect` (não popup — popups não funcionam de forma confiável em mobile/PWA instalado). Números de acesso aparecem em Firebase Console → Analytics (ou [analytics.google.com](https://analytics.google.com), propriedade `G-C5SBMCKN4H`).
  - **Regra de segurança do Firestore** (Console → Firestore Database → Regras) — sem isso, salvar o apelido falha (modo produção bloqueia tudo por padrão):
    ```
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /usuarios/{uid} {
          allow read, write: if request.auth != null && request.auth.uid == uid;
        }
      }
    }
    ```
  - Confirmar também em Authentication → Sign-in method → Google → **Enable** (senão dá erro `auth/operation-not-allowed`).
- **Placeholder do recurso PRO**: `ehUsuarioPro()` e `baixarDadosOffline()` em `js/script.js` são stubs — sempre retornam "não é PRO" / mostram um aviso "em construção". O botão "Baixar dados offline" já existe em Configurações, mas desabilitado, esperando alguma forma de marcar quem pagou (ex: campo no Firestore).

## Rodando localmente

Basta abrir `index.html` no navegador, ou servir a pasta com um servidor estático simples.

## Deploy

Publicado via GitHub Pages a partir da branch `main`.
