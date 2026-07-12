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
│   └── rj-municipios.geojson  # fonte geográfica dos municípios do RJ
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
- **Etapa 2** (atual): mapa oficial do IBGE com os 92 municípios do RJ, cada um com seu código IBGE real.
- **Etapa 3**: integrar o motor de raspadinha (`scratch-card.js`) ao clique nos municípios.
- **Etapa 4**: publicação no GitHub Pages.

## Rodando localmente

Basta abrir `index.html` no navegador, ou servir a pasta com um servidor estático simples.

## Deploy

Publicado via GitHub Pages a partir da branch `main`.
