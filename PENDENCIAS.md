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
- `linkMaps`: nenhum município tem ainda (nem Niterói) — precisa do
  link de verdade do Google Maps de cada lugar.

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
