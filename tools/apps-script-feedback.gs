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

  /* As três ações do Drive exigem QUEM ESTÁ CHAMANDO.

     Antes não exigiam nada, e a URL deste script está no repositório
     público: qualquer pessoa podia subir arquivo, mandar arquivo pra
     lixeira ou TORNAR PÚBLICO qualquer arquivo do Drive -- o script
     roda como o dono, então getFileById alcançava o Drive inteiro, não
     só as fotos do app.

     O feedback (bug/sugestão) continua aberto de propósito: ele só
     acrescenta linha numa planilha, e é enviado por gente deslogada. */
  if (dados.tipo === "upload-foto-post") {
    var quemSobe = exigirUsuario_(dados);
    if (quemSobe.erro) return quemSobe.resposta;
    return uploadFotoPost(dados);
  }

  if (dados.tipo === "excluir-foto-post") {
    var quemApaga = exigirUsuario_(dados);
    if (quemApaga.erro) return quemApaga.resposta;
    return excluirFotoPost(dados);
  }

  if (dados.tipo === "acesso-foto-post") {
    var quemMuda = exigirUsuario_(dados);
    if (quemMuda.erro) return quemMuda.resposta;
    return definirAcessoFotoPost(dados);
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
  /* Duas pastas, escolhidas por um campo OPCIONAL: sem ele, tudo cai
     na pasta de posts, que é como sempre foi. Isso é de propósito --
     enquanto esta versão do script não for republicada, o app novo
     continua funcionando contra o script antigo (que ignora o campo
     que não conhece). */
  var pasta = dados.destino === "perfil" ? obterPastaFotosPerfil() : obterPastaFotosPosts();
  var bytes = Utilities.base64Decode(dados.base64);
  var blob = Utilities.newBlob(bytes, dados.mimeType || "image/jpeg", dados.nomeArquivo || Date.now() + ".jpg");
  var arquivo = pasta.createFile(blob);
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // CDN do Google, e não o `drive.google.com/thumbnail?id=...` de antes.
  //
  // O endpoint de miniatura falhava de forma intermitente -- limite de
  // taxa por IP, e erro enquanto o Google ainda não tinha gerado a
  // miniatura do arquivo. O resultado no app eram fotos do mesmo
  // usuário, umas abrindo e outras não.
  //
  // O app tenta os outros formatos sozinho se este falhar (ver
  // aplicarFotoComFallback em js/script.js), então trocar aqui não
  // quebra nada que já esteja gravado.
  var fotoUrl = "https://lh3.googleusercontent.com/d/" + arquivo.getId() + "=w1600";
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, fotoUrl: fotoUrl, fotoId: arquivo.getId() })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Liga/desliga o acesso público de uma foto, SEM apagá-la.
 *
 * Existe pro arquivamento de banimento: quando uma conta é banida, o
 * conteúdo dela sai do app mas fica guardado 90 dias pra ela poder
 * recorrer. Só que a foto no Drive tem link "qualquer um com o link",
 * e uma imagem denunciada continuaria acessível a quem já tivesse o
 * endereço -- justamente a parte que mais causa dano.
 *
 * Revogar o compartilhamento resolve sem perder o arquivo: o ID
 * continua o mesmo, a URL passa a devolver erro, e um recurso aceito
 * religa o acesso com o mesmo link de antes.
 *
 * RESSALVA: o lh3.googleusercontent.com é CDN e guarda cache. O acesso
 * direto morre na hora, mas uma cópia em cache pode sobreviver um
 * tempo. Quem precisa de corte imediato e definitivo tem que apagar
 * (excluir-foto-post), não só revogar.
 */
function definirAcessoFotoPost(dados) {
  var arquivo = DriveApp.getFileById(dados.fotoId);
  if (!arquivoEhDoApp_(arquivo)) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, erro: "Esse arquivo não é do app." })
    ).setMimeType(ContentService.MimeType.JSON);
  }
  if (dados.publica) {
    arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } else {
    arquivo.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  }
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, publica: !!dados.publica })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Chamado ao excluir um post (ou a conta inteira) -- "melhor
 * esforço", não trava a exclusão do post/conta se o arquivo já tiver
 * sido apagado ou não for encontrado.
 */
function excluirFotoPost(dados) {
  try {
    if (dados.fotoId) {
      var arquivo = DriveApp.getFileById(dados.fotoId);
      if (arquivoEhDoApp_(arquivo)) arquivo.setTrashed(true);
    }
  } catch (erro) {
    // Arquivo já pode não existir mais -- sem problema.
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * Confirma que quem chamou está logado no Desbrava.
 *
 * Valida o ID token do Firebase no endpoint oficial do Google, em vez
 * de conferir a assinatura do JWT à mão: são 15 linhas contra
 * criptografia em Apps Script, e é o Google quem diz se o token presta,
 * se expirou e de quem ele é.
 *
 * A Web API Key do Firebase mora nas Propriedades do script. Ela é
 * pública por natureza (vai no app), mas fica fora do código aqui pelo
 * mesmo motivo de todo o resto: nada de valor cravado no arquivo.
 *
 * Devolve { erro: false, uid } ou { erro: true, resposta }.
 */
function exigirUsuario_(dados) {
  var negar = function (motivo) {
    return {
      erro: true,
      resposta: ContentService.createTextOutput(
        JSON.stringify({ ok: false, erro: motivo })
      ).setMimeType(ContentService.MimeType.JSON),
    };
  };

  var token = dados && dados.idToken;
  if (!token) return negar("Faça login no app pra enviar fotos.");

  var chave = PropertiesService.getScriptProperties().getProperty("FIREBASE_WEB_API_KEY");
  if (!chave) return negar("Servidor sem FIREBASE_WEB_API_KEY configurada.");

  try {
    var r = UrlFetchApp.fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(chave),
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ idToken: token }),
        muteHttpExceptions: true,
      }
    );
    if (r.getResponseCode() !== 200) return negar("Sessão expirada. Entre de novo no app.");
    var corpo = JSON.parse(r.getContentText());
    var uid = corpo && corpo.users && corpo.users[0] && corpo.users[0].localId;
    if (!uid) return negar("Sessão expirada. Entre de novo no app.");
    return { erro: false, uid: uid };
  } catch (e) {
    return negar("Não deu pra confirmar seu login agora.");
  }
}

/**
 * O arquivo está dentro de uma das pastas do app?
 *
 * Esta é a trava que importa. Mesmo com login válido, sem ela um id de
 * arquivo qualquer (e id vaza: todo arquivo já compartilhado tem o dele
 * numa URL) deixaria apagar ou publicar QUALQUER coisa do Drive do
 * dono, porque o script roda como ele.
 */
function arquivoEhDoApp_(arquivo) {
  var permitidas = {};
  permitidas[obterPastaFotosPosts().getId()] = true;
  permitidas[obterPastaFotosPerfil().getId()] = true;

  var pais = arquivo.getParents();
  while (pais.hasNext()) {
    if (permitidas[pais.next().getId()]) return true;
  }
  return false;
}

function obterPastaFotosPosts() {
  return obterPastaPorNome("Desbrava - Fotos de posts (provisório)");
}

/**
 * Pasta separada pras fotos de PERFIL.
 *
 * Elas viviam misturadas com as dos posts, e são coisas diferentes: a
 * foto de post é conteúdo publicado uma vez, a de perfil é a cara da
 * pessoa e costuma ser trocada. Separar deixa a limpeza e a auditoria
 * possíveis -- dá pra olhar uma pasta sem varrer milhares de fotos de
 * post no meio.
 */
function obterPastaFotosPerfil() {
  return obterPastaPorNome("Desbrava - Fotos de perfil");
}

/**
 * Acha a pasta pelo nome, ou cria na primeira vez.
 *
 * Por NOME e não por id fixo no código: id exige alguém criar a pasta
 * à mão e colar o valor aqui, e um id errado só aparece quando a
 * primeira foto falha. Assim o script se vira sozinho.
 */
function obterPastaPorNome(nome) {
  var pastas = DriveApp.getFoldersByName(nome);
  if (pastas.hasNext()) return pastas.next();
  return DriveApp.createFolder(nome);
}
