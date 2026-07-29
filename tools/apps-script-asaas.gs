/**
 * Webhook do Asaas + Dashboard financeiro, em Google Apps Script.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * O Firebase Cloud Functions exige o plano Blaze, e o projeto está no
 * Spark de propósito (ver BLAZE.md). Este script faz o papel do
 * backend: recebe o webhook do Asaas, registra a venda numa planilha
 * e libera o PRO escrevendo direto na API REST do Firestore.
 *
 * ATENÇÃO -- ESTE É UM SEGUNDO SCRIPT, SEPARADO
 * Já existe o tools/apps-script-feedback.gs (feedback + fotos dos
 * posts). NÃO junte os dois:
 *  1. aquele `doPost` roteia por `dados.tipo`, e o Asaas manda
 *     `event` -- os dois roteadores brigariam;
 *  2. a URL daquele script está publicada em js/auth.js, num
 *     repositório PÚBLICO. Endpoint que libera assinatura não pode
 *     ficar exposto assim.
 * Crie uma PLANILHA NOVA (ex.: "Desbrava - Financeiro") e cole este
 * arquivo no Apps Script dela.
 *
 * ---------------------------------------------------------------
 * PASSO A PASSO (uma vez só)
 *
 * 1) PLANILHA E SCRIPT
 *    - Crie a planilha "Desbrava - Financeiro" no Google Sheets.
 *    - Extensões → Apps Script. Apague o conteúdo padrão e cole este
 *      arquivo inteiro.
 *
 * 2) LIGAR O SCRIPT AO PROJETO DO FIREBASE  (passo que quase todo
 *    tutorial esquece, e sem ele o PATCH falha com "API not enabled")
 *    - No Console do Firebase → engrenagem → Configurações do projeto:
 *      anote o "Número do projeto" (só dígitos).
 *    - No Apps Script: engrenagem "Configurações do projeto" →
 *      "Projeto do Google Cloud Platform (GCP)" → "Alterar projeto" →
 *      cole o número → Definir projeto.
 *    - No Console do Google Cloud, com esse projeto selecionado,
 *      habilite a "Cloud Firestore API" (APIs e serviços → Ativar).
 *
 * 3) DECLARAR O ESCOPO DO FIRESTORE
 *    - Apps Script → Configurações do projeto → marque
 *      "Mostrar o arquivo de manifesto appsscript.json no editor".
 *    - Abra appsscript.json e deixe assim (a linha do datastore é a
 *      que autoriza escrever no Firestore):
 *
 *      "oauthScopes": [
 *        "https://www.googleapis.com/auth/spreadsheets.currentonly",
 *        "https://www.googleapis.com/auth/script.external_request",
 *        "https://www.googleapis.com/auth/datastore"
 *      ]
 *
 * 4) SEGREDOS (nunca dentro deste arquivo -- o repo é público)
 *    - Apps Script → Configurações do projeto → "Propriedades do
 *      script" → adicione:
 *        FIREBASE_PROJECT_ID  =  mapa-raspadinha-rj
 *        ASAAS_WEBHOOK_TOKEN  =  (invente uma senha longa e aleatória)
 *    - Guarde essa senha: ela vai no painel do Asaas no passo 7.
 *
 * 5) PREPARAR A PLANILHA
 *    - No editor, escolha a função `setupDashboard` e clique em
 *      "Executar". Autorize quando o Google pedir (é um script SEU,
 *      rodando na SUA conta).
 *    - Confira que nasceram as abas "Transações" e "Dashboard".
 *
 * 6) PUBLICAR
 *    - "Implantar" → "Nova implantação" → engrenagem → "App da Web":
 *        Executar como: Eu (seu e-mail)
 *        Quem tem acesso: Qualquer pessoa
 *      "Qualquer pessoa" é obrigatório -- o Asaas chama sem login.
 *      Quem protege o endpoint é o token do passo 4, conferido logo
 *      na entrada do doPost.
 *    - Copie a URL que termina em /exec.
 *
 * 7) APONTAR O ASAAS PRA CÁ
 *    - Asaas → Integrações → Webhooks → Adicionar:
 *        URL: a URL /exec do passo 6
 *        Token de autenticação: a MESMA senha do ASAAS_WEBHOOK_TOKEN
 *        Eventos: PAYMENT_RECEIVED e PAYMENT_CONFIRMED
 *    - Use primeiro o ambiente de SANDBOX do Asaas pra testar, e só
 *      depois troque pra produção.
 *
 * IMPORTANTE: toda vez que editar este script, crie uma NOVA
 * implantação (ou edite a existente) -- só salvar não atualiza a URL.
 * ---------------------------------------------------------------
 *
 * SOBRE A AUTENTICAÇÃO NO FIRESTORE
 * A Web API Key do Firebase NÃO serve pra isto. Ela autentica as
 * rotas do Firebase Auth (login por e-mail/senha), não a API REST do
 * Firestore. As duas formas que funcionam de verdade são: chave de
 * conta de serviço (um JSON secreto, que não pode viver num repo
 * público) ou um token OAuth do dono do projeto.
 *
 * Aqui usamos a segunda, via `ScriptApp.getOAuthToken()`: como o app
 * da Web roda "como eu" e a sua conta é dona do projeto no Firebase,
 * o próprio Google emite o token. Nenhuma chave fica escrita em lugar
 * nenhum. Consequência importante: esse token tem acesso
 * ADMINISTRATIVO, então ele ignora as Regras de Segurança do
 * Firestore -- inclusive a que exige `codigoAtivacaoPro` pra ligar o
 * `ehPro`. Isso é o desejado (o webhook é confiável), mas explica por
 * que não precisamos mandar o código secreto aqui.
 */

// ---------------------------------------------------------------
// Configuração (lida das Propriedades do script, nunca hardcoded)
// ---------------------------------------------------------------
function config_() {
  var props = PropertiesService.getScriptProperties();
  return {
    projectId: props.getProperty("FIREBASE_PROJECT_ID"),
    tokenWebhook: props.getProperty("ASAAS_WEBHOOK_TOKEN"),
  };
}

var ABA_TRANSACOES = "Transações";
var ABA_DASHBOARD = "Dashboard";
var CABECALHO = ["Data", "UID", "Cliente/Email", "Valor", "Status", "ID Cobrança"];

// Quantos meses de PRO cada pagamento confirmado concede.
var MESES_POR_PAGAMENTO = 1;

// ---------------------------------------------------------------
// 1. Preparação da planilha (rodar À MÃO, uma vez)
// ---------------------------------------------------------------
function setupDashboard() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();

  var transacoes = planilha.getSheetByName(ABA_TRANSACOES);
  if (!transacoes) transacoes = planilha.insertSheet(ABA_TRANSACOES);

  // Só escreve o cabeçalho se a aba estiver vazia -- rodar de novo
  // não pode apagar venda nenhuma.
  if (transacoes.getLastRow() === 0) {
    transacoes.getRange(1, 1, 1, CABECALHO.length).setValues([CABECALHO]);
  }

  var faixa = transacoes.getRange(1, 1, 1, CABECALHO.length);
  faixa.setFontWeight("bold").setBackground("#0F1216").setFontColor("#FFFFFF");
  transacoes.setFrozenRows(1);
  transacoes.getRange("A:A").setNumberFormat("dd/mm/yyyy hh:mm");
  transacoes.getRange("D:D").setNumberFormat('R$ #,##0.00');
  transacoes.autoResizeColumns(1, CABECALHO.length);

  var dashboard = planilha.getSheetByName(ABA_DASHBOARD);
  if (!dashboard) dashboard = planilha.insertSheet(ABA_DASHBOARD);
  dashboard.clear();

  dashboard.getRange("B2").setValue("Desbrava PRO — Resumo").setFontSize(16).setFontWeight("bold");

  var linhas = [
    ["Assinantes PRO (únicos)", "=COUNTUNIQUE(FILTER('" + ABA_TRANSACOES + "'!B2:B, '" + ABA_TRANSACOES + "'!B2:B<>\"\"))"],
    ["Receita total", "=SUM('" + ABA_TRANSACOES + "'!D2:D)"],
    // EOMONTH(HOJE;-1)+1 = primeiro dia do mês atual. Comparar assim
    // evita depender do fuso e de como a data foi digitada.
    ["Receita do mês atual", "=SUMIFS('" + ABA_TRANSACOES + "'!D2:D, '" + ABA_TRANSACOES + "'!A2:A, \">=\"&EOMONTH(TODAY(),-1)+1, '" + ABA_TRANSACOES + "'!A2:A, \"<=\"&EOMONTH(TODAY(),0)+1)"],
    ["Pagamentos registrados", "=COUNTA('" + ABA_TRANSACOES + "'!F2:F)"],
    ["Ticket médio", "=IFERROR(SUM('" + ABA_TRANSACOES + "'!D2:D)/COUNTA('" + ABA_TRANSACOES + "'!F2:F), 0)"],
  ];

  for (var i = 0; i < linhas.length; i++) {
    var linha = i + 4;
    dashboard.getRange(linha, 2).setValue(linhas[i][0]).setFontWeight("bold");
    // setFormula sempre usa a sintaxe em inglês, com VÍRGULA, mesmo
    // numa planilha em português -- o Sheets traduz na exibição.
    dashboard.getRange(linha, 3).setFormula(linhas[i][1]);
  }

  dashboard.getRange("C5:C6").setNumberFormat('R$ #,##0.00');
  dashboard.getRange("C8").setNumberFormat('R$ #,##0.00');
  dashboard.setColumnWidth(2, 220);
  dashboard.setColumnWidth(3, 160);

  SpreadsheetApp.getUi().alert("Pronto! Abas \"" + ABA_TRANSACOES + "\" e \"" + ABA_DASHBOARD + "\" prontas.");
}

// ---------------------------------------------------------------
// 2. Webhook do Asaas
// ---------------------------------------------------------------
function doPost(e) {
  // O Asaas considera qualquer resposta != 200 como falha e REPETE o
  // envio. Por isso o corpo inteiro é um try/catch que sempre devolve
  // 200: erro nosso não pode virar uma fila infinita de reenvios.
  try {
    var cfg = config_();

    // Segurança: o app da Web é público (o Asaas chama sem login),
    // então o token é a única coisa separando um pagamento de verdade
    // de alguém que descobriu a URL e quer PRO de graça.
    var tokenRecebido =
      (e && e.parameter && e.parameter.token) ||
      cabecalho_(e, "asaas-access-token");

    if (!cfg.tokenWebhook || tokenRecebido !== cfg.tokenWebhook) {
      logar_("Webhook recusado: token inválido ou ausente.");
      return ContentService.createTextOutput("OK"); // não entrega pista a quem sondar
    }

    var payload = JSON.parse(e.postData.contents);
    var evento = payload.event;
    if (evento !== "PAYMENT_RECEIVED" && evento !== "PAYMENT_CONFIRMED") {
      return ContentService.createTextOutput("OK"); // evento que não nos interessa
    }

    var pagamento = payload.payment || {};
    var uid = pagamento.externalReference; // o app manda o UID do Firebase aqui
    var idCobranca = pagamento.id;

    if (!uid) {
      logar_("Pagamento " + idCobranca + " sem externalReference (UID). Nada a liberar.");
      return ContentService.createTextOutput("OK");
    }

    // Idempotência: o Asaas reenvia o mesmo evento quando não recebe
    // 200 a tempo, e PAYMENT_CONFIRMED + PAYMENT_RECEIVED chegam para
    // a MESMA cobrança. Sem isto, a planilha contaria a venda duas
    // vezes e o dashboard mentiria.
    if (idCobranca && jaRegistrado_(idCobranca)) {
      logar_("Cobrança " + idCobranca + " já registrada, ignorando reenvio.");
      return ContentService.createTextOutput("OK");
    }

    registrarTransacao_({
      uid: uid,
      email: pagamento.customer || "",
      valor: Number(pagamento.value || 0),
      status: evento,
      idCobranca: idCobranca || "",
    });

    atualizarProNoFirestore_(uid);

    return ContentService.createTextOutput("OK");
  } catch (erro) {
    logar_("ERRO no webhook: " + (erro && erro.message));
    return ContentService.createTextOutput("OK");
  }
}

/** Cabeçalho HTTP do request, quando o Apps Script o expõe. */
function cabecalho_(e, nome) {
  if (!e || !e.headers) return null;
  var alvo = String(nome).toLowerCase();
  for (var k in e.headers) {
    if (String(k).toLowerCase() === alvo) return e.headers[k];
  }
  return null;
}

function abaTransacoes_() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName(ABA_TRANSACOES);
  if (!aba) {
    // Webhook chegando antes do setup: cria o mínimo pra não perder a
    // venda. O visual é ajustado depois, rodando setupDashboard.
    aba = planilha.insertSheet(ABA_TRANSACOES);
    aba.getRange(1, 1, 1, CABECALHO.length).setValues([CABECALHO]);
  }
  return aba;
}

function jaRegistrado_(idCobranca) {
  var aba = abaTransacoes_();
  var ultima = aba.getLastRow();
  if (ultima < 2) return false;
  var ids = aba.getRange(2, 6, ultima - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(idCobranca)) return true;
  }
  return false;
}

function registrarTransacao_(dados) {
  abaTransacoes_().appendRow([
    new Date(),
    dados.uid,
    dados.email,
    dados.valor,
    dados.status,
    dados.idCobranca,
  ]);
}

// ---------------------------------------------------------------
// 3. Liberação do PRO no Firestore (API REST, sem bibliotecas)
// ---------------------------------------------------------------
/**
 * Marca o usuário como PRO.
 *
 * Grava DOIS campos:
 *  - `ehPro` (boolean): é o que o app lê hoje (auth.js carrega em
 *    contaEhPro no login);
 *  - `proAte` (timestamp): quando a assinatura vence. O app ainda NÃO
 *    verifica esse campo -- fica gravado desde já pra quando o
 *    controle de expiração existir, e pra você conseguir auditar.
 *
 * O updateMask garante que só esses dois campos são tocados: sem ele,
 * o PATCH apagaria o resto do documento (apelido, progresso etc.).
 */
function atualizarProNoFirestore_(uid) {
  var cfg = config_();
  if (!cfg.projectId) {
    logar_("FIREBASE_PROJECT_ID não configurado nas Propriedades do script.");
    return;
  }

  var vence = new Date();
  vence.setMonth(vence.getMonth() + MESES_POR_PAGAMENTO);

  var url =
    "https://firestore.googleapis.com/v1/projects/" +
    cfg.projectId +
    "/databases/(default)/documents/usuarios/" +
    encodeURIComponent(uid) +
    "?updateMask.fieldPaths=ehPro&updateMask.fieldPaths=proAte";

  var corpo = {
    fields: {
      ehPro: { booleanValue: true },
      proAte: { timestampValue: vence.toISOString() },
    },
  };

  var resposta = UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true,
  });

  var codigo = resposta.getResponseCode();
  if (codigo >= 200 && codigo < 300) {
    logar_("PRO liberado para " + uid + " até " + vence.toISOString());
  } else {
    // Não relança: a venda já está na planilha, e derrubar o webhook
    // aqui só faria o Asaas reenviar tudo. Melhor registrar e você
    // liberar à mão se for preciso.
    logar_("Firestore recusou o PATCH de " + uid + " (HTTP " + codigo + "): " + resposta.getContentText());
  }
}

function logar_(mensagem) {
  console.log(mensagem); // aparece em "Execuções" no editor do Apps Script
}

// ---------------------------------------------------------------
// 4. Teste sem depender do Asaas
// ---------------------------------------------------------------
/**
 * Rode à mão pra conferir a ponta do Firestore antes de plugar o
 * Asaas. Troque o UID por um de teste (NÃO use a sua conta principal:
 * pela regra do Firestore, `ehPro` nunca volta pra false).
 */
function testarLiberacaoPro() {
  atualizarProNoFirestore_("COLE_AQUI_UM_UID_DE_TESTE");
}
