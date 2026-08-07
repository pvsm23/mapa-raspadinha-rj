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
 *      ASAAS_API_KEY        = sua chave do Asaas ($aact_...)
 *      ASAAS_AMBIENTE       = sandbox   (troque pra "producao" depois de testar)
 *      FIREBASE_PROJECT_ID  = mapa-raspadinha-rj
 *
 *    O FIREBASE_PROJECT_ID é pra rota `verificar`, que libera o
 *    Motoclube direto no Firestore quando o app pergunta se a cobrança
 *    foi paga (ver verificarPagamento_ lá embaixo).
 *
 * 2.1) LIGAR ESTE PROJETO AO GOOGLE CLOUD DO FIREBASE
 *    Declarar o escopo NÃO BASTA. Todo projeto do Apps Script nasce
 *    com um projeto do Google Cloud próprio e isolado; o token do
 *    ScriptApp.getOAuthToken() vale pra ELE, não pro seu Firebase. Sem
 *    associar os dois, o PATCH volta 403 com "PERMISSION_DENIED" ou
 *    "Cloud Firestore API has not been used" -- e o app mostra
 *    "Pagamento encontrado, mas a liberação falhou".
 *
 *    - Firebase → Configurações do projeto → copie o "Número do
 *      projeto" (só dígitos).
 *    - Apps Script → Configurações do projeto → "Projeto do Google
 *      Cloud Platform (GCP)" → Alterar projeto → cole o número →
 *      Definir projeto.
 *    - Console do Google Cloud, COM ESSE PROJETO SELECIONADO → APIs e
 *      serviços → Ativar → "Cloud Firestore API".
 *
 * 2.2) DECLARAR O ESCOPO DO FIRESTORE (senão o PATCH volta 403)
 *    - Configurações do projeto → marque "Mostrar o arquivo de
 *      manifesto appsscript.json no editor".
 *    - Em appsscript.json:
 *
 *      "oauthScopes": [
 *        "https://www.googleapis.com/auth/script.external_request",
 *        "https://www.googleapis.com/auth/datastore"
 *      ]
 *
 *    - Depois de mexer no manifesto, rode qualquer função uma vez no
 *      editor pra reautorizar -- o Google só pede as permissões novas
 *      na próxima execução manual.
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

// Quantos meses cada pagamento libera. TEM que ser igual ao
// MESES_POR_PAGAMENTO do tools/apps-script-asaas.gs: os dois scripts
// liberam acesso, e valores diferentes fariam o prazo mudar conforme
// quem chegasse primeiro, o webhook ou a verificação do app. Não dá
// pra compartilhar a constante -- são projetos separados do Apps
// Script, sem código em comum.
var MESES_POR_PAGAMENTO = 1;

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

    // O app pergunta "essa cobrança já foi paga?". Existe pra que o
    // acesso NÃO dependa do webhook conseguir chegar até aqui: quem
    // pagou pergunta por conta própria e é liberado na hora.
    if (pedido.acao === "verificar") {
      // try/catch próprio: um erro aqui NÃO pode cair no catch lá
      // embaixo e virar "Não foi possível gerar o Pix agora" -- ler
      // status e criar cobrança são coisas diferentes, e confundir as
      // duas escondeu um 404 de ambiente errado por uma noite inteira.
      try {
        return verificarPagamento_(pedido);
      } catch (erroVerificacao) {
        console.log("ERRO ao verificar: " + (erroVerificacao && erroVerificacao.message));
        return responder_({
          ok: false,
          contexto: "verificar",
          erro: String(erroVerificacao && erroVerificacao.message),
        });
      }
    }

    // Chegou uma ação que este script não conhece. Antes isso caía no
    // caminho de criar cobrança e gerava um Pix novo a cada tentativa,
    // sem que ninguém percebesse -- pior ainda quando o app já foi
    // atualizado e o script implantado ainda não.
    if (pedido.acao) {
      return responder_({
        ok: false,
        erro: "Ação desconhecida: " + pedido.acao + ". O script implantado está desatualizado.",
      });
    }

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
      // Esse texto aparece no app do banco do assinante na hora de
      // pagar -- tem que bater com o nome do produto no app.
      descricao = "Assinatura Motoclube Desbrava";
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
// Verificação por conta própria (rede de segurança do webhook)
// ---------------------------------------------------------------
/**
 * Pergunta ao Asaas se a cobrança foi paga e, se foi, libera o
 * Motoclube na hora.
 *
 * Por que isto existe: o webhook (tools/apps-script-asaas.gs) é um
 * ponto único de falha. Se o Asaas não conseguir alcançá-lo -- token
 * errado, script fora do ar, implantação velha -- quem pagou fica sem
 * nada e sem aviso. Aconteceu na estreia. Com esta rota, o próprio app
 * pergunta enquanto o QR está na tela, e o webhook vira só um atalho.
 *
 * Segurança: o UID sai do `externalReference` da COBRANÇA, nunca do
 * que o app mandou. Assim, mesmo que alguém invente um id de cobrança
 * alheia, quem é liberado é o dono legítimo daquele pagamento -- não
 * quem fez a chamada.
 */
function verificarPagamento_(pedido) {
  var id = String(pedido.id || "").trim();
  var uid = String(pedido.uid || "").trim();
  if (!id && !uid) return responder_({ ok: false, erro: "Nada a verificar." });

  // 1) A cobrança desta sessão, se houver.
  if (id) {
    var pagamento = chamarAsaas_("/payments/" + encodeURIComponent(id), "get");
    if (ehPago_(pagamento) && pagamento.externalReference) {
      return responder_({
        ok: true,
        pago: true,
        liberado: liberarMotoclube_(pagamento.externalReference, pagamento.id),
      });
    }
  }

  // 2) QUALQUER cobrança paga deste usuário.
  //
  // Sem isto, quem pagasse e fechasse o app ficaria sem acesso pra
  // sempre: ao voltar, o checkout gera uma cobrança NOVA, e a antiga --
  // a que foi paga de verdade -- nunca mais seria consultada. Foi
  // exatamente o que aconteceu no primeiro pagamento real.
  if (!uid) return responder_({ ok: true, pago: false });

  var lista = chamarAsaas_(
    "/payments?externalReference=" + encodeURIComponent(uid) + "&limit=100",
    "get"
  );
  var pagamentos = (lista && lista.data) || [];

  for (var i = 0; i < pagamentos.length; i++) {
    if (ehPago_(pagamentos[i])) {
      return responder_({
        ok: true,
        pago: true,
        liberado: liberarMotoclube_(uid, pagamentos[i].id),
      });
    }
  }

  // Devolve o que FOI encontrado, não só "não pago". Se o Asaas mostra
  // o pagamento e aqui aparece zero cobrança, a conta consultada é
  // outra -- e isso precisa ficar visível sem abrir o log do servidor.
  var statusEncontrados = [];
  for (var j = 0; j < pagamentos.length; j++) statusEncontrados.push(pagamentos[j].status);

  return responder_({
    ok: true,
    pago: false,
    cobrancasEncontradas: pagamentos.length,
    statusEncontrados: statusEncontrados,
    ambiente: config_().base,
  });
}

/**
 * RECEIVED = caiu na conta; CONFIRMED = confirmado, ainda liquidando;
 * RECEIVED_IN_CASH = baixa manual. Os três valem: o Asaas dispara
 * webhook pros dois primeiros, e segurar o acesso até a liquidação
 * seria punir quem já pagou.
 */
function ehPago_(pagamento) {
  if (!pagamento) return false;
  return (
    pagamento.status === "RECEIVED" ||
    pagamento.status === "CONFIRMED" ||
    pagamento.status === "RECEIVED_IN_CASH"
  );
}

/**
 * Liga `ehPro`/`proAte` no Firestore, com a mesma técnica do webhook:
 * API REST + ScriptApp.getOAuthToken(), que é token do DONO do projeto
 * e por isso ignora as Regras de Segurança (inclusive a que exige
 * codigoAtivacaoPro). A Web API Key do Firebase não serve aqui.
 *
 * Idempotente por `ultimoPagamentoAsaas`: o app pergunta de poucos em
 * poucos segundos, e sem essa trava cada pergunta empurraria o
 * vencimento pra frente enquanto a tela estivesse aberta.
 *
 * Renovação soma em cima do que ainda resta: quem renova antes do
 * vencimento não perde os dias que já pagou.
 */
function liberarMotoclube_(uid, idCobranca) {
  var projectId = PropertiesService.getScriptProperties().getProperty("FIREBASE_PROJECT_ID");
  if (!projectId) {
    console.log("FIREBASE_PROJECT_ID não configurado nas Propriedades do script.");
    return false;
  }

  var base =
    "https://firestore.googleapis.com/v1/projects/" +
    projectId +
    "/databases/(default)/documents/usuarios/" +
    encodeURIComponent(uid);
  var auth = { Authorization: "Bearer " + ScriptApp.getOAuthToken() };

  var atual = UrlFetchApp.fetch(base, { headers: auth, muteHttpExceptions: true });
  var campos = {};
  if (atual.getResponseCode() === 200) {
    campos = (JSON.parse(atual.getContentText()) || {}).fields || {};
  }

  if (campos.ultimoPagamentoAsaas && campos.ultimoPagamentoAsaas.stringValue === idCobranca) {
    return true; // esta cobrança já foi creditada
  }

  // Parte do que ainda resta, se ainda restar algo.
  var vence = new Date();
  var atualAte = campos.proAte && campos.proAte.timestampValue;
  if (atualAte) {
    var restante = new Date(atualAte);
    if (!isNaN(restante.getTime()) && restante > vence) vence = restante;
  }
  vence.setMonth(vence.getMonth() + MESES_POR_PAGAMENTO);

  var resposta = UrlFetchApp.fetch(
    base +
      "?updateMask.fieldPaths=ehPro&updateMask.fieldPaths=proAte" +
      "&updateMask.fieldPaths=ultimoPagamentoAsaas",
    {
      method: "patch",
      contentType: "application/json",
      headers: auth,
      payload: JSON.stringify({
        fields: {
          ehPro: { booleanValue: true },
          proAte: { timestampValue: vence.toISOString() },
          ultimoPagamentoAsaas: { stringValue: idCobranca },
        },
      }),
      muteHttpExceptions: true,
    }
  );

  var codigo = resposta.getResponseCode();
  if (codigo >= 200 && codigo < 300) {
    console.log("Motoclube liberado para " + uid + " até " + vence.toISOString());
    return true;
  }

  console.log("Firestore recusou o PATCH de " + uid + " (HTTP " + codigo + "): " + resposta.getContentText());
  return false;
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
/**
 * RODE ISTO PRIMEIRO quando um pagamento "sumir".
 *
 * Responde, num log só, a pergunta que separa todas as hipóteses:
 * a chave configurada aqui enxerga a conta onde o dinheiro entrou?
 *
 * Um pagamento feito em PRODUÇÃO é invisível pra uma chave de SANDBOX
 * (e vice-versa) -- são contas diferentes, com bases diferentes. Se a
 * lista abaixo vier vazia ou sem o seu pagamento, o problema não é
 * webhook, nem token, nem Firestore: é a chave apontando pro lugar
 * errado. Nenhum conserto no Apps Script resolve isso.
 */
function diagnosticar() {
  var cfg = config_();
  console.log("Base da API: " + cfg.base);
  console.log("Chave configurada: " + (cfg.chave ? "sim (" + cfg.chave.slice(0, 12) + "...)" : "NÃO"));
  console.log(
    "FIREBASE_PROJECT_ID: " +
      (PropertiesService.getScriptProperties().getProperty("FIREBASE_PROJECT_ID") || "NÃO CONFIGURADO")
  );

  try {
    var saldo = chamarAsaas_("/finance/balance", "get");
    console.log("Saldo na conta: R$ " + saldo.balance);
  } catch (erro) {
    console.log("Não consegui ler o saldo: " + erro.message);
  }

  var lista = chamarAsaas_("/payments?limit=20", "get");
  var pagamentos = (lista && lista.data) || [];
  console.log("Cobranças nesta conta: " + pagamentos.length);

  for (var i = 0; i < pagamentos.length; i++) {
    var p = pagamentos[i];
    console.log(
      "  " + p.dateCreated + " | " + p.id + " | R$ " + p.value + " | " + p.status +
        " | uid=" + (p.externalReference || "(vazio)")
    );
  }

  if (!pagamentos.length) {
    console.log(
      "NENHUMA cobrança aqui. Se você pagou, foi em OUTRO ambiente -- " +
        "troque ASAAS_API_KEY/ASAAS_AMBIENTE pro ambiente certo."
    );
  }
}

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
