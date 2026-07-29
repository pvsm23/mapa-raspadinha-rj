/**
 * Gera cobrança Pix no Asaas — a "ponta 1" do fluxo de pagamento.
 *
 * O par deste arquivo é tools/apps-script-asaas.gs (o webhook, que
 * recebe a confirmação e libera o PRO). Aqui é o contrário: o app
 * pede uma cobrança, este script fala com o Asaas e devolve o QR
 * Code. Existe porque a chave da API do Asaas NÃO pode ficar no
 * JavaScript do app -- qualquer pessoa abre o DevTools e lê.
 *
 * ---------------------------------------------------------------
 * TRÊS COISAS QUE PRECISAM SER DITAS ANTES
 *
 * 1) NÃO DÁ PRA "CONFIGURAR CORS" NO APPS SCRIPT.
 *    O ContentService não deixa escrever cabeçalho de resposta -- não
 *    existe Access-Control-Allow-Origin pra setar. O que funciona é
 *    NÃO PROVOCAR o preflight: uma requisição com
 *    `Content-Type: text/plain` é "simples" pro navegador, vai direto,
 *    e o Google já responde com Allow-Origin: *. Com
 *    `application/json` o navegador manda um OPTIONS antes, o Apps
 *    Script não sabe responder OPTIONS, e a chamada morre em erro de
 *    CORS. Por isso o app manda text/plain (é o mesmo truque que o
 *    apps-script-feedback.gs já usa há tempos).
 *
 * 2) NO ASAAS, PIX AVULSO NÃO EXISTE.
 *    A API v3 exige um `customer` em toda cobrança -- não há como
 *    criar um Pix só com CPF e nome soltos. O fluxo obrigatório é:
 *      a) GET /customers?cpfCnpj=... (procura o cliente)
 *      b) se não achar, POST /customers { name, cpfCnpj }
 *      c) POST /payments { customer, billingType: "PIX", ... }
 *      d) GET /payments/{id}/pixQrCode  <-- só AQUI vem o QR Code
 *    O passo (d) é fácil de esquecer: a resposta de criar a cobrança
 *    NÃO traz o QR Code, só o id.
 *
 * 3) O PREÇO NÃO PODE VIR DO APP.
 *    Se o valor chegasse do frontend, bastaria alguém trocar para
 *    0,01 no DevTools e o webhook liberaria o PRO por um centavo.
 *    Aqui o preço do PRO é decidido NO SERVIDOR (PRECO_PRO abaixo).
 *    Pedidos da Loja têm um teto, também no servidor.
 * ---------------------------------------------------------------
 *
 * PASSO A PASSO (uma vez só)
 *
 * 1) Crie uma planilha nova (ex.: "Desbrava - Cobranças") ou reuse a
 *    "Desbrava - Financeiro". Extensões → Apps Script → cole este
 *    arquivo. É um projeto SEPARADO do webhook: URLs diferentes,
 *    responsabilidades diferentes.
 *
 * 2) Propriedades do script (engrenagem → Propriedades do script):
 *      ASAAS_API_KEY   = sua chave do Asaas ($aact_...)
 *      ASAAS_AMBIENTE  = sandbox     (troque pra "producao" depois de testar)
 *
 * 3) Implantar → Nova implantação → App da Web:
 *      Executar como: Eu
 *      Quem tem acesso: Qualquer pessoa
 *    Copie a URL /exec.
 *
 * 4) Cole a URL em URL_COBRANCA_PIX, no topo de js/script.js.
 *
 * 5) Teste com `testarCobranca()` (no fim deste arquivo) ANTES de
 *    plugar no app, e sempre em sandbox primeiro.
 */

// Preço do PRO, em reais. Decidido aqui, no servidor, de propósito.
var PRECO_PRO = 9.9;

// Teto de segurança pra pedidos da Loja: acima disso a cobrança é
// recusada. Evita que alguém use o endpoint pra criar cobranças
// absurdas na sua conta do Asaas.
var TETO_LOJA = 500;

// Dias até o vencimento do Pix.
var DIAS_VENCIMENTO = 1;

function config_() {
  var props = PropertiesService.getScriptProperties();
  var ambiente = props.getProperty("ASAAS_AMBIENTE") || "sandbox";
  return {
    chave: props.getProperty("ASAAS_API_KEY"),
    base:
      ambiente === "producao"
        ? "https://api.asaas.com/v3"
        : "https://sandbox.asaas.com/api/v3",
  };
}

// ---------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------
function doPost(e) {
  try {
    var pedido = JSON.parse(e.postData.contents);

    var uid = String(pedido.uid || "").trim();
    var cpf = soDigitos_(pedido.cpf);
    var nome = String(pedido.nome || "").trim() || "Desbravador";
    var tipo = pedido.tipo === "loja" ? "loja" : "pro";

    if (!uid) return responder_({ ok: false, erro: "Faça login antes de assinar." });
    if (cpf.length !== 11 && cpf.length !== 14) {
      return responder_({ ok: false, erro: "CPF inválido." });
    }

    // O valor do PRO NUNCA vem do app (ver observação 3 no topo).
    var valor;
    var descricao;
    if (tipo === "pro") {
      valor = PRECO_PRO;
      descricao = "Assinatura Desbrava PRO";
    } else {
      valor = Number(pedido.valor || 0);
      descricao = String(pedido.descricao || "Pedido Loja Desbrava").slice(0, 100);
      if (!(valor > 0) || valor > TETO_LOJA) {
        return responder_({ ok: false, erro: "Valor do pedido fora do permitido." });
      }
    }

    var clienteId = obterOuCriarCliente_(nome, cpf);
    var cobranca = criarCobrancaPix_(clienteId, valor, descricao, uid);
    var qr = obterQrCode_(cobranca.id);

    return responder_({
      ok: true,
      id: cobranca.id,
      valor: valor,
      descricao: descricao,
      // "payload" é o nome do campo no Asaas -- é o Pix copia e cola.
      payloadCode: qr.payload,
      encodedImage: qr.encodedImage,
      expiraEm: qr.expirationDate || null,
    });
  } catch (erro) {
    console.log("ERRO ao gerar cobrança: " + (erro && erro.message));
    return responder_({ ok: false, erro: "Não foi possível gerar o Pix agora." });
  }
}

// ---------------------------------------------------------------
// Asaas
// ---------------------------------------------------------------
function chamarAsaas_(caminho, metodo, corpo) {
  var cfg = config_();
  if (!cfg.chave) throw new Error("ASAAS_API_KEY não configurada nas Propriedades do script.");

  var opcoes = {
    method: metodo || "get",
    contentType: "application/json",
    headers: { access_token: cfg.chave },
    muteHttpExceptions: true,
  };
  if (corpo) opcoes.payload = JSON.stringify(corpo);

  var resposta = UrlFetchApp.fetch(cfg.base + caminho, opcoes);
  var codigo = resposta.getResponseCode();
  var texto = resposta.getContentText();

  if (codigo < 200 || codigo >= 300) {
    console.log("Asaas " + metodo + " " + caminho + " -> HTTP " + codigo + ": " + texto);
    throw new Error("Asaas respondeu " + codigo);
  }
  return JSON.parse(texto);
}

/**
 * Procura o cliente pelo CPF e cria só se não existir.
 *
 * Importante: o Asaas NÃO impede dois clientes com o mesmo CPF. Se a
 * gente criasse um a cada compra, o painel viraria uma lista de
 * duplicatas e o histórico da pessoa se perderia.
 */
function obterOuCriarCliente_(nome, cpf) {
  var busca = chamarAsaas_("/customers?cpfCnpj=" + encodeURIComponent(cpf), "get");
  if (busca && busca.data && busca.data.length) return busca.data[0].id;

  var novo = chamarAsaas_("/customers", "post", { name: nome, cpfCnpj: cpf });
  return novo.id;
}

function criarCobrancaPix_(clienteId, valor, descricao, uid) {
  var vencimento = new Date();
  vencimento.setDate(vencimento.getDate() + DIAS_VENCIMENTO);

  return chamarAsaas_("/payments", "post", {
    customer: clienteId,
    billingType: "PIX",
    value: valor,
    dueDate: Utilities.formatDate(vencimento, "America/Sao_Paulo", "yyyy-MM-dd"),
    description: descricao,
    // É ESTE campo que o webhook lê pra saber quem liberar
    // (ver tools/apps-script-asaas.gs).
    externalReference: uid,
  });
}

/** O QR Code vem numa chamada SEPARADA -- criar a cobrança não devolve. */
function obterQrCode_(idCobranca) {
  return chamarAsaas_("/payments/" + idCobranca + "/pixQrCode", "get");
}

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------
function soDigitos_(v) {
  return String(v || "").replace(/\D/g, "");
}

function responder_(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ---------------------------------------------------------------
// Teste manual (rodar daqui, sem depender do app)
// ---------------------------------------------------------------
function testarCobranca() {
  var e = {
    postData: {
      contents: JSON.stringify({
        tipo: "pro",
        uid: "UID_DE_TESTE",
        nome: "Teste Desbrava",
        cpf: "12345678909", // CPF de teste; em sandbox o Asaas aceita
      }),
    },
  };
  console.log(doPost(e).getContent());
}
