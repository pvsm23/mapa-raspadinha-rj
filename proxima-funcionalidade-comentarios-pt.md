# Comentários e posts por ponto turístico

**Combinado com o Paulo: só começar DEPOIS de terminada a varredura de
verificação dos pontos.** Anotado para não se perder.

## O que ele pediu

1. **Comentários nos pontos turísticos.** Só quem **visitou o município**
   daquele ponto pode comentar. Todo mundo pode **ler**.
2. **Na Comunidade**, o post passa a poder marcar **o ponto turístico**,
   não só o município.
3. Ao marcar o município, aparece a **lista de pontos daquele município,
   com busca**. Marcar o ponto é **opcional**.
4. No painel do ponto turístico, um **botão que leva aos posts marcados
   com aquele ponto**.

## O que já existe e dá pra reaproveitar

- `posts` no Firestore já guarda `municipioId` — falta um `pontoIndice`
  (ou id estável do ponto, ver abaixo).
- O painel do ponto (`#modal-ponto`, `abrirPontoTuristico`) já tem a
  fileira de chips de ação: o botão "Posts" entra ali do lado de
  "Rotas" e "Fotos".
- O seletor de município com busca já existe no fluxo de Sugestões e
  pode virar base do seletor de ponto.
- A regra "visitou o município" já é calculável: `estadoMapa[id]` tem
  `visitado` e `verificado`, e `presencaConfirmadaEm` guarda a
  confirmação por GPS.

## Decisões a tomar antes de codar

**1. Como identificar um ponto de forma estável.** ✅ **FEITO**
Cada ponto de `data/destinos.json` tem um campo `id` no formato
`<municipioId>-<slug-do-nome>` — ex. `3302106-praca-da-matematica`.

**REGRA: o id nunca é recalculado.** Ele foi gerado do nome UMA vez e
não acompanha renomeação. Se um ponto mudar de nome, o id continua o
antigo — parecer "errado" é o preço de não migrar comentário de lugar.
O gerador (`tools/`) só cria id para ponto que ainda não tem.

O runtime ainda usa o índice do array (`dataset.indice` em
`renderizarPontosTuristicos`) para abrir o painel, e tudo bem: isso é
resolvido dentro da mesma sessão. O `id` é para o que PERSISTE —
comentário, post marcado, favorito.

**2. Que régua de "visitou" usar.**
Três níveis possíveis, do mais frouxo ao mais rígido:
- raspou o selo do município (`visitado`);
- teve presença confirmada por GPS (`verificado` / `presencaConfirmadaEm`);
- esteve perto daquele ponto especificamente.

O pedido diz "quem visitou o município", então o critério é o do
município — mas vale decidir se raspar basta ou se exige verificação por
GPS. Raspar é fácil de burlar; GPS é mais honesto e mais chato.

**3. Moderação.**
Comentário é conteúdo de terceiro num app que hoje só tem posts da
Comunidade. Precisa decidir se herda a moderação que já existe (o painel
em Configurações) ou se ganha fluxo próprio de denúncia.

## Ordem sugerida

1. Dar id estável a cada ponto (pré-requisito de tudo).
2. Marcar ponto no post + seletor com busca.
3. Botão "Posts" no painel do ponto.
4. Comentários com a trava de quem visitou.
