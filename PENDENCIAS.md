# Manual: onde colocar cada tipo de conteúdo

Guia de referência de tudo que é conteúdo (texto ou imagem) e que já
tem espaço reservado no código — só falta preencher o arquivo certo,
com a estrutura certa. Sempre que preencher algo, teste abrindo o
município/região/conquista correspondente no app antes de considerar
pronto (o JSON precisa continuar válido).

## 1. Resumo/história completa de cada município (o texto que abre a
"janela suspensa" 📖 depois de raspar)

Arquivo: `data/curiosidades.json`. Cada município (chave = código do
IBGE) é um objeto com dois campos:

```json
"3303302": {
  "resumo": "1 a 3 frases — aparece direto no popup do selo, sem precisar clicar em nada.",
  "historiaCompleta": [
    "Parágrafo 1 (aparece na janela separada, aberta pelo botão \"📖 Saiba mais\").",
    "Parágrafo 2.",
    "Parágrafo 3 — quantos parágrafos quiser, cada string da lista vira um <p> na janela."
  ]
}
```

- `resumo`: obrigatório pra aparecer alguma coisa; se ficar `""`, o
  popup mostra um texto de espaço reservado ("Em breve...").
- `historiaCompleta`: opcional. Se a lista estiver vazia (`[]`), o
  botão "📖 Saiba mais" simplesmente não aparece — só o resumo curto.
  Só vale a pena preencher quando o município tem bastante conteúdo
  (linha do tempo, várias curiosidades) que não cabe num resumo de
  2-3 frases.
- **Município já preenchido como exemplo**: Niterói (`3303302`) — dá
  pra abrir o app, raspar/visualizar o selo de Niterói e ver os dois
  níveis (resumo + janela "Saiba mais") funcionando de verdade.
- Os outros 91 municípios estão com `resumo: ""` e
  `historiaCompleta: []`, prontos pra receber texto.

## 2. Pontos turísticos de cada município

Arquivo: `data/destinos.json`. Cada município tem uma lista
`destinos`, e cada ponto turístico é:

```json
{
  "nome": "Nome do lugar",
  "descricao": "Frase curta — já preenchida pros 92 municípios (460 pontos).",
  "textoCompleto": "Parágrafo mais longo com história/curiosidade — aparece ao clicar no ponto turístico dentro do popup do município.",
  "linkMaps": "https://maps.google.com/... — opcional, sem ele o botão \"▶️ Abrir no Maps\" fica desabilitado."
}
```

- `descricao`: **já concluída** pros 92 municípios.
- `textoCompleto`: só preenchido pros 5 pontos turísticos de Niterói
  até agora (exemplo de referência). Falta pros outros 91 municípios
  (455 pontos turísticos).
- `linkMaps`: **já preenchido pros 5 pontos turísticos de Niterói**
  (exemplo de referência) — falta pros outros 91 municípios.

### Como conseguir e colocar o `linkMaps` você mesmo

1. Abra [Google Maps](https://maps.google.com) (celular ou computador)
   e busque o nome do ponto turístico.
2. Clique em **"Compartilhar"** no card do lugar → **"Copiar link"**
   (é um link curto, tipo `https://maps.app.goo.gl/XXXXXXXXXXXXX`).
3. Abra `data/destinos.json`, ache o município pelo código IBGE (ex:
   Niterói é `"3303302"`) e cole o link no campo `linkMaps` do ponto
   turístico certo — **confira que o nome do lugar bate** (o Google às
   vezes sugere um resultado diferente do esperado na busca).
4. Salve o arquivo. Não precisa mexer em nenhum código — só abrir o
   ponto turístico no popup do município já mostra o botão
   "▶️ Abrir no Maps" habilitado, puxando esse link.
5. **Cuidado com JSON inválido**: toda entrada precisa de vírgula
   entre os campos (menos o último) e aspas duplas em tudo — se
   quiser conferir se não quebrou nada antes de testar no app, cole o
   conteúdo do arquivo em [jsonlint.com](https://jsonlint.com) ou peça
   pra eu validar.

## 3. Resumo de cada região

Arquivo: `data/regioes-resumo.json` (reservado, ainda não existe/está
vazio). Vai aparecer no popup de cada uma das 8 regiões (Costa Verde,
Metropolitana, Serrana, Baixadas Litorâneas, Norte Fluminense,
Noroeste Fluminense, Centro-Sul Fluminense, Médio Paraíba). Ainda não
tem um lugar no código lendo esse arquivo — precisa implementar a
leitura junto com o preenchimento, se/quando for feito.

## 4. Imagens dos selos

### Municípios — `assets/img/selos/`

| Arquivo | Obrigatório? | O que é |
|---|---|---|
| `<código-ibge>.png` | Sem ele, cai no placeholder gerado na hora | Selo colorido, revelado depois de raspar |
| `<código-ibge>fundo.png` | Sem ele, usa uma capa cinza lisa | Versão preto-e-branco, é a "capa" raspável |
| `<código-ibge>dourado.png` | Opcional | Versão dourada, usada só quando aquele selo saiu "brilhante" (5% de chance). Sem ela, o brilhante usa a arte normal mesmo (só perde a arte dourada, continua com o efeito de sol/raios) |

Exemplo já existente: `3303302dourado.png` (Niterói).

### Regiões (mega-selos) — `assets/img/regioes/`

Mesma lógica dos municípios, trocando o código IBGE pelo id da
região: `costa-verde`, `metropolitana`, `serrana`,
`baixadas-litoraneas`, `norte-fluminense`, `noroeste-fluminense`,
`centro-sul-fluminense`, `medio-paraiba`. Arquivos:
`<id>.png`, `<id>fundo.png`, `<id>dourado.png` (10% de chance de
brilhante nas regiões).

### Conquistas — `assets/img/conquistas/`

`<chave>.png` / `<chave>fundo.png` (conquistas não têm versão
dourada — não existe "conquista brilhante"). As 24 chaves atuais:

`primeiros-passos`, `25pct`, `50pct`, `75pct`, `100pct`, `streak-7`,
`dia-3`, `dia-5`, `dia-8`, `regiao-1`, `regiao-25pct`,
`regiao-50pct`, `regiao-100pct`, `brilhante-1`, `brilhante-3`,
`brilhante-5`, `brilhante-10`, `brilhante-25`, `brilhante-50`,
`brilhante-100pct`, `regiao-brilhante-1`, `regiao-brilhante-25pct`,
`regiao-brilhante-50pct`, `regiao-brilhante-100pct`.

## Chave PIX de colaboração

Botão 💬 (barra de topo) → aba "🤝 Colaborar" mostra uma chave PIX pra
quem quiser ajudar financeiramente (sempre opcional). A chave fica na
constante `CHAVE_PIX_COLABORACAO`, bem no topo de `js/script.js` —
**já preenchida** (`pvsm23@jim.com`). Diferente do código secreto do
Plano PRO, essa chave **não precisa ser segredo** (é justamente pra
aparecer pro usuário copiar), então não tem problema ela estar
visível no código-fonte público. Se quiser trocar, é só editar essa
constante.

Sobre **como receber** — recomendação: **chave PIX é a opção mais
simples** pra esse caso (doação avulsa, sem meta fixa, contínua ao
longo do tempo) — sem taxas, cai na hora, todo mundo no Brasil já usa.
"Vaquinha online" (Vakinha, Kickante etc.) costuma servir melhor pra
metas fixas com prazo (ex: "preciso de R$500 pra taxa da Play Store"),
não pra apoio recorrente/avulso — e geralmente cobra uma taxa sobre o
valor arrecadado. Se no futuro quiser apoio recorrente (tipo
assinatura mensal), vale olhar Apoia.se ou Padrim (equivalentes
brasileiros do Patreon).

## Plano PRO

Fase 1 (feita): só o distintivo "PRO" amarelo do lado do apelido no
Ranking, sem cobrança nenhuma ainda. Campo `usuarios/{uid}.ehPro`
(boolean). Arquitetura:

- **Regra do Firestore** (bloco em `README.md`, seção do
  Firebase Console): uma escrita normal (apelido, progresso, estado de
  municípios etc.) nunca consegue alterar `ehPro` — a regra só permite
  a escrita se `ehPro` sair igual a como entrou, **ou** se estiver
  virando `true` pela primeira vez numa escrita que também mande um
  campo `codigoAtivacaoPro` com o valor secreto certo. Depois de
  `true`, a regra bloqueia qualquer tentativa de reverter — fica pra
  sempre.
- **O código secreto em si NÃO fica em nenhum arquivo do repositório**
  (nem aqui, nem no README, nem em nenhum `.js`) — o texto do
  `README.md` só tem um placeholder (`SUBSTITUA_POR_UM_CODIGO_SECRETO_SEU`)
  que precisa ser trocado pelo código de verdade só na hora de colar a
  regra no Firebase Console. Isso é proposital: como o repositório é
  público, qualquer segredo escrito num arquivo ficaria visível pra
  qualquer pessoa no GitHub.
- **Como ativar numa conta**: só via console do navegador (DevTools),
  logado na conta que vai virar PRO — não existe (e não deve existir)
  nenhum botão/campo visível no app pra isso. O comando exato foi
  passado separadamente, fora deste repositório.
- **Futuro/sem prazo definido**: cobrança de verdade (checkout,
  webhook confirmando pagamento) e o recurso PRO de baixar dados
  offline (`ehUsuarioPro()`/`baixarDadosOffline()` em `js/script.js`
  ainda são stubs que sempre dizem "não é PRO"/mostram "em
  construção").

## Configuração no Firebase Console (fora do código)

- **Ativar login por e-mail/senha**: Console → Authentication →
  Sign-in method → Email/senha → Enable.
- **Colar as regras de segurança do Firestore**: Console → Firestore
  Database → Regras — o texto completo e atualizado (com as
  subcoleções de convites, pedidos de amizade, amigos e check-in, a
  proteção do campo `ehPro` e a fila de e-mails) está no `README.md`.
  **Antes de colar**, troque o placeholder
  `SUBSTITUA_POR_UM_CODIGO_SECRETO_SEU` pelo seu código secreto de
  verdade (ver seção "Plano PRO" acima).
- **Instalar a extensão "Trigger Email"** (pro e-mail de boas-vindas
  funcionar de verdade): 1) mudar o projeto pro plano **Blaze**
  (Console → ⚙️ → Uso e faturamento → Modificar plano — tem cota
  gratuita, só exige cartão cadastrado); 2) criar conta num provedor
  de SMTP (ex: [Brevo](https://www.brevo.com), plano grátis de 300
  e-mails/dia) e pegar a "SMTP connection URI"; 3) Console →
  Extensions → buscar **"Trigger Email"** (`firestore-send-email`) →
  Install, colando essa URI e deixando o nome da coleção como `mail`
  (o padrão, já é o que `enviarEmailProprio` em `js/auth.js` usa).
  Até isso estar feito, os e-mails de boas-vindas ficam só
  enfileirados no Firestore, sem serem enviados de verdade.
