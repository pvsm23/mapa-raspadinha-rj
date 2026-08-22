# Os Apps Script mudaram de casa

Os cinco projetos do Google Apps Script saíram deste repositório e foram
para o repositório **privado** `pvsm23/desbrava-interno`, em
`apps-script/`.

| Arquivo | Função |
|---|---|
| `apps-script-feedback.gs` | Feedback, fotos da Comunidade no Drive e o acesso público delas |
| `apps-script-gerar-cobranca.gs` | Cobrança Pix do Motoclube |
| `apps-script-clima.gs` | Gatilho de 30 min: clima dos 92 municípios |
| `apps-script-asaas.gs` | Webhook do pagamento |
| `apps-script-limpar-arquivo.gs` | Gatilho diário: apaga arquivo de banimento vencido |

Vários comentários em `js/auth.js`, `js/script.js` e `js/clima.js` ainda
citam esses arquivos pelo nome — é lá que eles estão agora.

## Por que saíram

Eles descrevem a lógica que roda **nos servidores do Google em nome do
dono**, e não é código servido ao navegador. O resto do app não tem como
ser secreto: o site entrega o JavaScript inteiro para qualquer visitante
e o APK é um pacote com os mesmos arquivos.

Este repositório continua público de propósito. Arquivo de release
herda a visibilidade do repositório, então torná-lo privado quebraria o
link de download do APK — que é o que o próprio app usa para se
atualizar.

## Nada quebrou com a mudança

Nenhum passo do build depende destes arquivos. Eles nunca foram
empacotados no APK nem publicados no site: são o código-fonte de
projetos que vivem no Apps Script, e só passam a valer quando
reimplantados de lá.
