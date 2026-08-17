# Comentários e posts por ponto turístico

## Etapa 1 — Comentários no ponto ✅ FEITO

Coleção `pontosTuristicos/{pontoId}/comentarios/{id}`, com o **id
estável** do ponto (`3302106-praca-da-matematica`), nunca o índice.

**Quem comenta: só quem teve a presença CONFIRMADA POR GPS no
município do ponto** (decisão do Paulo, 17/08/2026). Ler é de todo
mundo. Raspar o selo não basta de propósito — dá pra raspar o estado
inteiro do sofá, e aí o comentário deixaria de valer como relato de
quem esteve lá.

Três estados de tela, todos testados:

| situação | o que aparece |
|---|---|
| deslogado | "Entre na sua conta para comentar." |
| logado, sem GPS no município | "Só quem teve a presença confirmada por GPS em *\<cidade\>* pode comentar aqui. Use o Modo Viagem quando estiver lá." |
| logado, verificado por GPS | campo de texto + botão Comentar |

**A trava séria é a Regra do Firestore, não a tela** — quem abrir o
DevTools passa pelo `classList.toggle` e esbarra na regra. A regra lê o
doc do próprio usuário e confere
`estadoMunicipios[municipioId].verificado == true`.

Detalhe que a regra precisa e não é óbvio: o `{pontoId}` é **opaco pra
regra** (ela não lê `data/destinos.json`), então o `municipioId` viaja
dentro do próprio comentário — e o create exige que ele seja o
**prefixo do pontoId**. Sem isso, alguém com Niterói verificado
poderia comentar num ponto de Paraty declarando `municipioId: Niterói`.
Confirmado que o prefixo bate nos 456 pontos.

**Moderação: herdada da que já existe** (por conta, no painel de
Configurações — bloquear a conta corta a escrita em tudo), mais o autor
podendo apagar o próprio comentário. Sem update: comentário não se
edita, se apaga e escreve de novo.

### Falta você fazer

**Publicar as regras do Firestore** (Console → Firestore Database →
Regras). São **três blocos**, todos no `README.md`:

1. `match /pontosTuristicos/{pontoId}/comentarios/{comentarioId}` —
   comentários e curtidas;
2. `match /respostas/{respostaId}`, aninhado dentro do de cima;
3. `match /notificacoes/{id}`, dentro de `match /usuarios/{uid}`.

**Enquanto não subirem, comentar/responder/notificar falha** — coleção
nova cai no `deny` padrão do modo produção.

## Etapa 2 — Marcar o ponto no post ✅ FEITO

- O post grava `pontoId` (o id estável), opcional.
- O seletor de ponto **só aparece depois de escolher o município**, e
  reaproveita a MESMA folha do seletor de município — trocando título,
  placeholder e a fonte da lista. Dois modais seriam markup, CSS e
  animação repetidos só pra trocar os dados.
- **Trocar de município zera o ponto**: um ponto de Paraty não pode
  ficar pendurado num post marcado como Niterói.
- Chip **"Posts"** no painel do ponto leva à Comunidade filtrada por
  ele. Quando há `pontoId`, ele manda sobre o `municipioId` na consulta
  (o id já carrega o município no prefixo, e filtrar pelos dois pediria
  um índice composto a mais).

## Etapa 3 — Curtidas, respostas e notificações ✅ FEITO

**Ordenação por curtidas, dentro do painel do ponto** (o feed da
Comunidade segue cronológico). Ordena no cliente, não no Firestore:
`orderBy('numCurtidas')` exigiria índice e pagina errado se alguém
curtir no meio da rolagem. Empate desempata pelo mais antigo.

**Responder é de QUALQUER pessoa logada, mesmo sem GPS** — é onde quem
tem dúvida pergunta a quem esteve lá. Só o comentário de primeiro nível
exige a verificação. Coleção:
`pontosTuristicos/{pontoId}/comentarios/{id}/respostas/{id}`.

**Notificações** (`usuarios/{uid}/notificacoes`): curtida e comentário
nas suas coisas da Comunidade, e resposta no seu comentário de ponto.
Sino na barra de topo com contador (vira "9+" acima de nove).

> **Sem Cloud Functions, quem grava a notificação é o cliente de QUEM
> AGE.** Curtiu meu post? O SEU app grava o aviso na MINHA caixa.
> Consequências: a regra precisa liberar qualquer autenticado a criar na
> caixa de qualquer um (exigindo `deUid == auth.uid`), o que é
> abusável pelo DevTools; e se o app de quem agiu cair no meio, o aviso
> se perde — por isso é sempre "melhor esforço", nunca derruba a ação.
> **Quando o Blaze entrar, isso vira gatilho de servidor** e o create
> pode fechar. Ver `BLAZE.md`.

## Onde as coisas estão

- API: `comentarPonto` / `listarComentariosPonto` /
  `excluirComentarioPonto` em `js/auth.js`.
- Tela: `montarComentariosDoPonto`, `renderizarComentariosDoPonto`,
  `enviarComentarioDoPonto` em `js/script.js`.
- Marcação: `<section id="ponto-comentarios">` em `index.html`.
- Estilo: bloco "COMENTÁRIOS DO PONTO TURÍSTICO" no fim do
  `css/styles.css` — **depois** da CAMADA UI MODERNA de propósito, que
  força `background: var(--surf2) !important` em todo `button` e
  deixaria o "Comentar" cinza em vez de verde.
