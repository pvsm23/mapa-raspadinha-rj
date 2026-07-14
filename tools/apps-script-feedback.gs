/**
 * Google Apps Script Web App que recebe os relatos de bug/sugestão do
 * botão 💬 do Desbrava (ver enviarFeedbackParaPlanilha em js/auth.js)
 * e grava uma linha na planilha certa -- "Bugs" ou "Sugestões" -- de
 * acordo com o campo "tipo" recebido.
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
  var nomeAba = dados.tipo === "bug" ? "Bugs" : "Sugestões";

  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName(nomeAba);
  if (!aba) {
    aba = planilha.insertSheet(nomeAba);
    aba.appendRow(["Data", "Apelido", "E-mail", "Texto"]);
  }

  aba.appendRow([new Date(), dados.apelido || "", dados.email || "", dados.texto || ""]);

  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
    ContentService.MimeType.JSON
  );
}
