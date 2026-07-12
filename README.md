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
└── assets/
    ├── svg/              # mapa SVG oficial (futuro)
    └── img/selos/        # imagens dos "selos" revelados ao raspar
```

## Etapas do desenvolvimento

- **Etapa 1** (atual): mapa de teste com 3 municípios como formas geométricas, clique alterna estado visitado/não visitado, progresso salvo no `localStorage`.
- **Etapa 2**: substituir o SVG de teste pelo mapa oficial do IBGE com todos os municípios do RJ.
- **Etapa 3**: integrar o motor de raspadinha (`scratch-card.js`) ao clique nos municípios.
- **Etapa 4**: publicação no GitHub Pages.

## Rodando localmente

Basta abrir `index.html` no navegador, ou servir a pasta com um servidor estático simples.

## Deploy

Publicado via GitHub Pages a partir da branch `main`.
