/**
 * Limpeza do arquivo de banimento do Desbrava -- Apps Script.
 *
 * ============================================================
 * O QUE ISTO RESOLVE
 * ============================================================
 *
 * Conta banida por três denúncias aceitas não tem o conteúdo destruído
 * na hora: ele sai do app e vai pra `arquivoBanimento/{uid}/itens`, onde
 * fica 90 dias pra pessoa poder recorrer (ver arquivarConteudoDaConta em
 * js/auth.js). Banimento automático erra, e apagar sem volta seria
 * punir erro do sistema com dano permanente.
 *
 * Só que o Firestore não tem expiração automática, e o plano Spark não
 * tem Cloud Functions. Alguém precisa varrer o que venceu -- é este
 * script, num gatilho diário. Sem ele o "arquivo de 90 dias" viraria
 * "arquivo pra sempre", que é o oposto do combinado com quem foi banido.
 *
 * As FOTOS já tiveram o acesso público revogado no momento do
 * banimento (o app chama a ação "acesso-foto-post"). Aqui elas são
 * apagadas de vez, junto com o registro.
 *
 * ============================================================
 * COMO INSTALAR (uma vez)
 * ============================================================
 *
 * 1. script.google.com -> Novo projeto -> cole este arquivo.
 *    PROJETO SEPARADO dos outros três (feedback, cobrança e clima):
 *    cada um tem seu gatilho e sua conta de execução, e misturar deixa
 *    a falha de um derrubando o outro.
 *
 * 2. Configurações do projeto -> Propriedades do script -> adicione:
 *       FIREBASE_PROJECT_ID = mapa-raspadinha-rj
 *       URL_FEEDBACK        = <a URL do Apps Script de feedback>
 *
 *    A segunda é o que permite apagar a foto do Drive: o arquivo está
 *    na conta daquele script, não na deste.
 *
 * 3. DECLARE O ESCOPO DO FIRESTORE -- sem isto o passo 4 falha com
 *    "403 ACCESS_TOKEN_SCOPE_INSUFFICIENT".
 *
 *    O Apps Script só pede os escopos que ADIVINHA lendo o código, e
 *    como aqui só aparece UrlFetchApp ele deixa o Firestore de fora.
 *
 *    - Configurações do projeto -> marque "Mostrar o arquivo de
 *      manifesto appsscript.json no editor".
 *    - Abra o appsscript.json e deixe com estes escopos:
 *
 *        "oauthScopes": [
 *          "https://www.googleapis.com/auth/script.external_request",
 *          "https://www.googleapis.com/auth/datastore"
 *        ]
 *
 * 4. Rode `limparArquivoVencido` UMA VEZ à mão, pelo editor, pra
 *    autorizar. Com o arquivo vazio ela não faz nada e devolve 0 --
 *    é o esperado.
 *
 *    NA PRIMEIRA VEZ ela falha com "Firestore 400: The query requires
 *    a COLLECTION_GROUP_ASC index for collection itens and field
 *    arquivadoEm". Isso NÃO é erro no código: toda query collectionGroup
 *    com filtro de campo exige um índice que o Firestore não cria
 *    sozinho. O próprio erro traz um link que abre a criação já
 *    preenchida -- ou, à mão: Firestore -> Índices -> Campo único ->
 *    Adicionar isenção, coleção `itens`, campo `arquivadoEm`, escopo
 *    Grupo de coleção, Crescente. Espere sair de "Criando" e rode de
 *    novo.
 *
 * 5. Gatilhos (ícone do relógio) -> Adicionar gatilho:
 *       função: limparArquivoVencido
 *       origem: Acionador por tempo
 *       tipo: Timer diário -> entre 3h e 4h da manhã
 *
 *    Uma vez por dia basta: a diferença entre apagar no dia 90 ou no
 *    91 não importa pra ninguém, e rodar de hora em hora só gastaria
 *    cota à toa.
 */

var DIAS_DE_ARQUIVO = 90;

function propriedade_(nome) {
  var valor = PropertiesService.getScriptProperties().getProperty(nome);
  if (!valor) throw new Error("Falta a propriedade do script: " + nome);
  return valor;
}

function baseFirestore_() {
  return (
    "https://firestore.googleapis.com/v1/projects/" +
    propriedade_("FIREBASE_PROJECT_ID") +
    "/databases/(default)/documents"
  );
}

function chamarFirestore_(url, metodo) {
  var resposta = UrlFetchApp.fetch(url, {
    method: metodo || "get",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  var codigo = resposta.getResponseCode();
  if (codigo >= 300) {
    throw new Error("Firestore " + codigo + ": " + resposta.getContentText().slice(0, 300));
  }
  var corpo = resposta.getContentText();
  return corpo ? JSON.parse(corpo) : {};
}

/**
 * Varre o arquivo inteiro e apaga o que passou de DIAS_DE_ARQUIVO.
 *
 * Usa `runQuery` com collectionGroup em vez de listar conta por conta:
 * não existe uma lista de "quem está banido" pra percorrer, e varrer
 * todas as contas do app só pra achar as poucas arquivadas seria caro.
 */
function limparArquivoVencido() {
  var limite = new Date(Date.now() - DIAS_DE_ARQUIVO * 24 * 60 * 60 * 1000);
  var consulta = {
    structuredQuery: {
      from: [{ collectionId: "itens", allDescendants: true }],
      where: {
        fieldFilter: {
          field: { fieldPath: "arquivadoEm" },
          op: "LESS_THAN",
          value: { timestampValue: limite.toISOString() },
        },
      },
      limit: 300,
    },
  };

  var resposta = UrlFetchApp.fetch(baseFirestore_() + ":runQuery", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(consulta),
    muteHttpExceptions: true,
  });
  if (resposta.getResponseCode() >= 300) {
    throw new Error("Firestore " + resposta.getResponseCode() + ": " + resposta.getContentText().slice(0, 300));
  }

  var linhas = JSON.parse(resposta.getContentText());
  var apagados = 0;
  var fotos = 0;

  for (var i = 0; i < linhas.length; i++) {
    var documento = linhas[i].document;
    if (!documento) continue;

    /* O collectionGroup "itens" também casa com sugestoesComunidade e
       selosIndicados, que usam o mesmo nome de subcoleção. Só o que
       está sob arquivoBanimento pode ser apagado aqui -- sem esta
       checagem, a limpeza comeria sugestão de gente que não fez nada. */
    if (documento.name.indexOf("/arquivoBanimento/") === -1) continue;

    var campos = documento.fields || {};
    var dados = campos.dados && campos.dados.mapValue && campos.dados.mapValue.fields;
    var fotoId = dados && dados.fotoDriveId && dados.fotoDriveId.stringValue;
    if (fotoId) {
      // Melhor esforço: se o Drive falhar, o registro some do mesmo
      // jeito -- deixar de apagar o texto porque a foto resistiu seria
      // guardar dado além do prazo prometido.
      try {
        UrlFetchApp.fetch(propriedade_("URL_FEEDBACK"), {
          method: "post",
          contentType: "text/plain",
          payload: JSON.stringify({ tipo: "excluir-foto-post", fotoId: fotoId }),
          muteHttpExceptions: true,
        });
        fotos++;
      } catch (erro) {
        Logger.log("Falha ao apagar foto " + fotoId + ": " + erro);
      }
    }

    chamarFirestore_("https://firestore.googleapis.com/v1/" + documento.name, "delete");
    apagados++;
  }

  Logger.log("Arquivo vencido: " + apagados + " registros e " + fotos + " fotos apagados.");
  return apagados;
}
