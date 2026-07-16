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
 *   Firestore sozinho.
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
