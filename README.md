# Mapa Raspadinha - Rio de Janeiro

Site estático onde o usuário "raspa" municípios do Rio de Janeiro no mapa conforme os visita, com progresso salvo no navegador.

## Estrutura do projeto

```
.
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── script.js         # lógica principal do mapa e estado
│   └── scratch-card.js   # motor genérico de raspadinha (canvas)
├── assets/
│   ├── svg/              # SVG dos 92 municípios (gerado, ver tools/)
│   └── img/selos/        # imagens dos "selos" revelados ao raspar (futuro)
├── data/
│   ├── rj-municipios.geojson  # fonte geográfica dos municípios do RJ
│   └── destinos.json          # pontos turísticos por município (parcial)
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
- **Item 4 (em andamento)**: `data/destinos.json` com pontos turísticos por município — hoje cobre só 19 municípios (Magé, Mangaratiba, Maricá, Mendes, Mesquita, Miguel Pereira, Miracema, Natividade, Nilópolis, Niterói, Nova Friburgo, Nova Iguaçu, Paracambi, Paraíba do Sul, Paraty, Paty do Alferes, Petrópolis, Pinheiral, Piraí); os demais 73 ficam para completar depois.
- **Etapa 4**: publicação no GitHub Pages.

## Rodando localmente

Basta abrir `index.html` no navegador, ou servir a pasta com um servidor estático simples.

## Deploy

Publicado via GitHub Pages a partir da branch `main`.
