# Pendências (conteúdo que você disse que ia preencher)

Lista do que ficou combinado ao longo do desenvolvimento — tudo isso já
tem espaço reservado no código/dados, só falta o conteúdo em si.

## Textos e histórias

- **Lore/curiosidade de cada município** — `data/curiosidades.json`
  (criado vazio para os 92 municípios). Aparece no popup só depois de
  raspar o selo daquele município.
- **História/curiosidade de cada ponto turístico** — campo
  `textoCompleto` em `data/destinos.json` (nenhum preenchido ainda).
  Aparece ao clicar no ponto turístico dentro do popup do município.
- **Descrição curta dos pontos turísticos que faltam** — campo
  `descricao` em `data/destinos.json`. Só 19 municípios têm (Magé,
  Mangaratiba, Maricá, Mendes, Mesquita, Miguel Pereira, Miracema,
  Natividade, Nilópolis, Niterói, Nova Friburgo, Nova Iguaçu,
  Paracambi, Paraíba do Sul, Paraty, Paty do Alferes, Petrópolis,
  Pinheiral, Piraí) — faltam os outros 73.
- **Resumo em texto de cada região** — `data/regioes-resumo.json`
  (reservado, vazio). Aparece no popup de cada uma das 8 regiões.

## Links

- **Link do Google Maps de cada ponto turístico** — campo `linkMaps`
  em `data/destinos.json` (nenhum preenchido ainda). Enquanto não
  existir, o botão "▶️ Abrir no Maps" fica desabilitado.

## Imagens (selos)

- **Selos dos municípios** — `assets/img/selos/<código-ibge>.png`
  (colorido) e `assets/img/selos/<código-ibge>fundo.png` (preto e
  branco, capa raspável). Sem eles, cai no placeholder gerado na hora.
- **Mega-selos das 8 regiões** — `assets/img/regioes/<id>.png` /
  `<id>fundo.png` (ids: costa-verde, metropolitana, serrana,
  baixadas-litoraneas, norte-fluminense, noroeste-fluminense,
  centro-sul-fluminense, medio-paraiba).
- **Selos das 5 conquistas** — `assets/img/conquistas/<chave>.png` /
  `<chave>fundo.png` (chaves: `10pct`, `25pct`, `50pct`, `75pct`,
  `100pct`).

## Configuração no Firebase Console (fora do código)

- **Ativar login por e-mail/senha**: Console → Authentication →
  Sign-in method → Email/senha → Enable.
- **Colar as regras de segurança do Firestore**: Console → Firestore
  Database → Regras — o texto completo e atualizado (com as
  subcoleções de convites, pedidos de amizade, amigos e check-in) está
  no `README.md`.

## Futuro / sem prazo definido

- **Recurso PRO**: alguma forma de marcar quem pagou (ex: campo no
  Firestore) para liberar `baixarDadosOffline()` de verdade — hoje é
  só um placeholder desabilitado.
