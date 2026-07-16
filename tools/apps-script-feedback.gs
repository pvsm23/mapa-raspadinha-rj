/**
 * Google Apps Script Web App que recebe:
 * - os relatos de bug/sugestão/ponto turístico do botão 💬 do
 *   Desbrava (ver enviarFeedbackParaPlanilha em js/auth.js), gravando
 *   uma linha na aba certa -- "Bugs", "Sugestões" ou "Pontos
 *   Turísticos" -- de acordo com o campo "tipo" recebido;
 * - os registros de atividade suspeita do anti-GPS-falso (ver
 *   registrarAtividadeSuspeita em js/auth.js), aba "Atividades
 *   suspeitas";
 * - o espelho de status de conta (ver definirStatusDeConta em
 *   js/auth.js), aba "Usuários" -- essa aba é só pra CONSULTA; quem
 *   decide o status de verdade é o app (painel de moderação em
 *   Configurações), não editar essa planilha esperando que volte pro
 *   Firestore sozinho;
 * - SOLUÇÃO PROVISÓRIA (ver README.md, seção Comunidade Desbrava): o
 *   upload da foto de cada post, salva numa pasta do Drive da própria
 *   conta que roda este script -- usado enquanto o projeto não migrar
 *   pro plano Blaze do Firebase (que passou a ser exigido pra ativar
 *   o Cloud Storage). Ver uploadFotoPost/excluirFotoPost abaixo.
 *   IMPORTANTE: como isso usa DriveApp (serviço novo pra este script),
 *   depois de colar essa versão você precisa criar uma NOVA
 *   implantação (não só salvar) e autorizar de novo quando o Google
 *   pedir -- é o mesmo aviso de sempre, só que agora pedindo acesso ao
 *   Drive também.
 *
 * COMO IMPLANTAR (só precisa fazer uma vez):
 * 1. Abra a planilha no Google Sheets.
 * 2. Menu Extensões → Apps Script.
 * 3. Apague o conteúdo padrão (function myFunction() {...}) e cole
 *    este arquivo inteiro no lugar.
 * 4. Salve (ícone de disquete ou Ctrl+S); dê um nome ao projeto, ex:
 *    "Feedback Desbrava".
 * 5. Clique em "Implantar" (Deploy) → "Nova implantação" → ícone de
 *    engrenagem → escolha "App da Web" (Web app).
 *      - Executar como: Eu (seu e-mail)
 *      - Quem tem acesso: Qualquer pessoa
 * 6. Clique em "Implantar". O Google vai pedir autorização (é um
 *    aviso normal pra scripts não verificados que são SEUS, rodando
 *    na SUA conta, só mexendo NESSA planilha) -- clique em
 *    "Avançar"/"Acessar [nome do projeto] (não seguro)" → "Permitir".
 * 7. Copie a "URL do app da Web" (termina em /exec).
 * 8. Cole essa URL em `URL_PLANILHA_FEEDBACK`, no topo de
 *    `js/auth.js`, no lugar do placeholder
 *    "SUBSTITUA_AQUI_PELA_URL_DO_APPS_SCRIPT".
 *
 * Se depois editar este script de novo, é preciso criar uma NOVA
 * implantação (ou editar a existente em "Gerenciar implantações")
 * pra a mudança valer -- só salvar o código não atualiza a URL já em
 * uso.
 */
function doPost(e) {
  var dados = JSON.parse(e.postData.contents);

  if (dados.tipo === "usuario-status") {
    atualizarUsuarioNaPlanilha(dados);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
      ContentService.MimeType.JSON
    );
  }

  if (dados.tipo === "upload-foto-post") {
    return uploadFotoPost(dados);
  }

  if (dados.tipo === "excluir-foto-post") {
    return excluirFotoPost(dados);
  }

  var config = {
    bug: { aba: "Bugs", cabecalho: ["Data", "Apelido", "E-mail", "Texto"] },
    sugestao: { aba: "Sugestões", cabecalho: ["Data", "Apelido", "E-mail", "Texto"] },
    "ponto-turistico": {
      aba: "Pontos Turísticos",
      cabecalho: ["Data", "Apelido", "E-mail", "Município", "Texto"],
    },
    "atividade-suspeita": {
      aba: "Atividades suspeitas",
      cabecalho: [
        "Data",
        "Apelido",
        "E-mail",
        "Município anterior",
        "Município novo",
        "Distância (km)",
        "Tempo (min)",
        "Velocidade implícita (km/h)",
      ],
    },
  };
  var info = config[dados.tipo] || config.sugestao;

  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName(info.aba);
  if (!aba) {
    aba = planilha.insertSheet(info.aba);
    aba.appendRow(info.cabecalho);
  }

  var linha;
  if (dados.tipo === "ponto-turistico") {
    linha = [new Date(), dados.apelido || "", dados.email || "", dados.municipio || "", dados.texto || ""];
  } else if (dados.tipo === "atividade-suspeita") {
    linha = [
      new Date(),
      dados.apelido || "",
      dados.email || "",
      dados.municipioAnterior || "",
      dados.municipioNovo || "",
      dados.distanciaKm != null ? dados.distanciaKm : "",
      dados.tempoMin != null ? dados.tempoMin : "",
      dados.velocidadeKmh != null ? dados.velocidadeKmh : "",
    ];
  } else {
    linha = [new Date(), dados.apelido || "", dados.email || "", dados.texto || ""];
  }

  aba.appendRow(linha);

  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * Upsert por e-mail na aba "Usuários" (Apelido, E-mail, Status) --
 * procura uma linha com esse e-mail e atualiza; se não achar, cria
 * uma linha nova. Só espelho/consulta (ver comentário no topo).
 */
function atualizarUsuarioNaPlanilha(dados) {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName("Usuários");
  if (!aba) {
    aba = planilha.insertSheet("Usuários");
    aba.appendRow(["Apelido", "E-mail", "Status"]);
  }

  var totalLinhas = aba.getLastRow() - 1;
  var emails = totalLinhas > 0 ? aba.getRange(2, 2, totalLinhas, 1).getValues() : [];
  for (var i = 0; i < emails.length; i++) {
    if (emails[i][0] === dados.email) {
      var linha = i + 2;
      aba.getRange(linha, 1).setValue(dados.apelido || "");
      aba.getRange(linha, 3).setValue(dados.status || "ativo");
      return;
    }
  }
  aba.appendRow([dados.apelido || "", dados.email || "", dados.status || "ativo"]);
}

/**
 * Salva a foto de um post numa pasta do Drive (criada sozinha no
 * primeiro uso) e deixa com o link "qualquer pessoa com o link pode
 * ver" -- é a única forma de um <img> no site conseguir carregar a
 * imagem, já que o Drive não tem como checar se quem está pedindo é
 * um usuário logado no Desbrava (diferente do Firebase Storage, que
 * checava isso pela regra de segurança). Ver aviso de privacidade no
 * README.md.
 */
function uploadFotoPost(dados) {
  var pasta = obterPastaFotosPosts();
  var bytes = Utilities.base64Decode(dados.base64);
  var blob = Utilities.newBlob(bytes, dados.mimeType || "image/jpeg", dados.nomeArquivo || Date.now() + ".jpg");
  var arquivo = pasta.createFile(blob);
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var fotoUrl = "https://drive.google.com/thumbnail?id=" + arquivo.getId() + "&sz=w1600";
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, fotoUrl: fotoUrl, fotoId: arquivo.getId() })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Chamado ao excluir um post (ou a conta inteira) -- "melhor
 * esforço", não trava a exclusão do post/conta se o arquivo já tiver
 * sido apagado ou não for encontrado.
 */
function excluirFotoPost(dados) {
  try {
    if (dados.fotoId) DriveApp.getFileById(dados.fotoId).setTrashed(true);
  } catch (erro) {
    // Arquivo já pode não existir mais -- sem problema.
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
    ContentService.MimeType.JSON
  );
}

function obterPastaFotosPosts() {
  var nome = "Desbrava - Fotos de posts (provisório)";
  var pastas = DriveApp.getFoldersByName(nome);
  if (pastas.hasNext()) return pastas.next();
  return DriveApp.createFolder(nome);
}
