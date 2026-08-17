/**
 * Clima compartilhado do Desbrava -- Apps Script.
 *
 * ============================================================
 * O PROBLEMA QUE ISTO RESOLVE
 * ============================================================
 *
 * Antes, cada aparelho falava direto com o Open-Meteo. O app já
 * agrupava as cidades (até 40 por chamada) e guardava 30 min de cache,
 * então uma sessão ativa gastava ~5 requisições -- mas o consumo
 * crescia LINEARMENTE COM O NÚMERO DE USUÁRIOS.
 *
 * Os limites do plano gratuito do Open-Meteo são 10.000 chamadas/dia,
 * 5.000/hora e 600/MINUTO. A conta: ~1.000 a 2.000 sessões diárias
 * bateriam o teto do dia, e o de minuto cairia antes disso se muita
 * gente abrisse o app ao mesmo tempo.
 *
 * Com este script, o consumo vira FIXO: 92 municípios ÷ 40 por lote =
 * 3 chamadas, a cada 30 minutos = ~144 por dia. Tenha o app 10 ou
 * 10.000 usuários, são as mesmas 144. Os clientes passam a ler um
 * único documento do Firestore.
 *
 * ============================================================
 * COMO INSTALAR (uma vez)
 * ============================================================
 *
 * 1. script.google.com -> Novo projeto -> cole este arquivo.
 *    Use um PROJETO SEPARADO dos outros dois (feedback e cobrança):
 *    cada um tem seu gatilho e sua conta de execução, e misturar
 *    deixa a falha de um derrubando o outro.
 *
 * 2. Configurações do projeto -> Propriedades do script -> adicione:
 *       FIREBASE_PROJECT_ID = mapa-raspadinha-rj
 *    (não é segredo, mas fica fora do código como todos os outros)
 *
 * 3. Rode `atualizarClima` UMA VEZ à mão, pelo editor. O Google vai
 *    pedir autorização -- é o que emite o token que escreve no
 *    Firestore. Confira no Console do Firebase se o documento
 *    `clima/atual` apareceu.
 *
 * 4. Gatilhos (ícone do relógio) -> Adicionar gatilho:
 *       função: atualizarClima
 *       origem: Acionador por tempo
 *       tipo: Timer por minuto -> A cada 30 minutos
 *
 * 5. Publique a regra do Firestore que libera a LEITURA pública de
 *    `clima/atual` (está no README.md).
 *
 * ============================================================
 * DECISÕES QUE VALE CONHECER
 * ============================================================
 *
 * - ESCRITA COM TOKEN ADMINISTRATIVO. `ScriptApp.getOAuthToken()`
 *   emite um token da SUA conta, dona do projeto. Ele IGNORA as Regras
 *   do Firestore -- é por isso que a regra pode proibir escrita de
 *   todo mundo e mesmo assim este script grava. Nenhuma chave fica
 *   escrita aqui (mesmo mecanismo do apps-script-asaas.gs).
 *
 * - TUDO NUM DOCUMENTO SÓ, e o conteúdo num campo de TEXTO com JSON
 *   dentro. O formato REST do Firestore é verborrágico (cada número
 *   vira {"integerValue":"24"}), e 92 municípios × 4 dias viraria um
 *   documento enorme e ilegível. Como string, são ~20 KB e o cliente
 *   faz um JSON.parse. O limite de um documento é 1 MB, folgado.
 *
 * - AS COORDENADAS VÊM DO SITE, de data/municipios-coordenadas.json,
 *   gerado por tools/geojson-to-svg.js. Não são copiadas pra cá de
 *   propósito: duas listas desencontrariam na primeira vez que o mapa
 *   mudasse, e o clima começaria a ser buscado no lugar errado sem
 *   ninguém perceber.
 *
 * - SE UM LOTE FALHAR, o script NÃO apaga o que já estava publicado:
 *   ele mescla com o documento anterior. Clima velho é melhor que
 *   nenhum, e uma falha de rede momentânea não pode zerar o mapa.
 */

var URL_COORDENADAS =
  "https://pvsm23.github.io/mapa-raspadinha-rj/data/municipios-coordenadas.json";
var BASE_OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
var POR_LOTE = 40;
var COLECAO = "clima";
var DOCUMENTO = "atual";

function config_() {
  var props = PropertiesService.getScriptProperties();
  var projectId = props.getProperty("FIREBASE_PROJECT_ID");
  if (!projectId) {
    throw new Error(
      "Falta a propriedade FIREBASE_PROJECT_ID (Configurações do projeto > Propriedades do script)."
    );
  }
  return { projectId: projectId };
}

/** Ponto de entrada -- é esta função que o gatilho de tempo chama. */
function atualizarClima() {
  var cfg = config_();
  var municipios = buscarCoordenadas_();
  var ids = Object.keys(municipios);
  if (!ids.length) throw new Error("Lista de coordenadas veio vazia.");

  // Começa do que já está publicado: se um lote falhar, o município
  // fica com o dado anterior em vez de sumir do mapa.
  var dados = lerPublicado_(cfg.projectId) || {};
  var novos = 0;
  var lotesComFalha = 0;

  for (var i = 0; i < ids.length; i += POR_LOTE) {
    var lote = ids.slice(i, i + POR_LOTE);
    var resposta = buscarLoteDeClima_(lote, municipios);
    if (!resposta) {
      lotesComFalha++;
      continue;
    }
    for (var j = 0; j < lote.length; j++) {
      var arrumado = arrumar_(resposta[j]);
      if (arrumado) {
        dados[lote[j]] = arrumado;
        novos++;
      }
    }
  }

  if (!novos) throw new Error("Nenhum município atualizado -- Open-Meteo fora do ar?");

  gravarPublicado_(cfg.projectId, dados);
  Logger.log(
    "clima/atual: " + novos + " municípios atualizados, " +
    Object.keys(dados).length + " no documento, " + lotesComFalha + " lote(s) com falha"
  );
}

function buscarCoordenadas_() {
  var resposta = UrlFetchApp.fetch(URL_COORDENADAS, { muteHttpExceptions: true });
  if (resposta.getResponseCode() !== 200) {
    throw new Error("Não consegui ler as coordenadas: HTTP " + resposta.getResponseCode());
  }
  return JSON.parse(resposta.getContentText());
}

/** Uma chamada ao Open-Meteo para até POR_LOTE municípios. */
function buscarLoteDeClima_(ids, municipios) {
  var lats = [];
  var lons = [];
  for (var i = 0; i < ids.length; i++) {
    lats.push(municipios[ids[i]].lat);
    lons.push(municipios[ids[i]].lon);
  }
  var url =
    BASE_OPEN_METEO +
    "?latitude=" + lats.join(",") +
    "&longitude=" + lons.join(",") +
    "&current_weather=true" +
    "&daily=weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset" +
    "&timezone=" + encodeURIComponent("America/Sao_Paulo") +
    "&forecast_days=4";

  var resposta = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resposta.getResponseCode() !== 200) {
    Logger.log("Open-Meteo respondeu " + resposta.getResponseCode());
    return null;
  }
  var corpo = JSON.parse(resposta.getContentText());
  // Com UMA coordenada a API devolve objeto; com várias, array.
  return corpo.length === undefined ? [corpo] : corpo;
}

/** Mesmo formato que js/clima.js já usa, pra o cliente não precisar traduzir. */
function arrumar_(cru) {
  if (!cru || !cru.current_weather) return null;
  var diario = cru.daily || {};
  var dias = [];
  var tempos = diario.time || [];
  for (var i = 0; i < tempos.length; i++) {
    dias.push({
      data: tempos[i],
      codigo: diario.weathercode ? diario.weathercode[i] : null,
      max: Math.round(diario.temperature_2m_max[i]),
      min: Math.round(diario.temperature_2m_min[i]),
    });
  }
  return {
    temperatura: Math.round(cru.current_weather.temperature),
    vento: Math.round(cru.current_weather.windspeed),
    codigo: cru.current_weather.weathercode,
    ehNoite: cru.current_weather.is_day === 0,
    altitude: typeof cru.elevation === "number" ? Math.round(cru.elevation) : null,
    nascer: soAHora_(diario.sunrise ? diario.sunrise[0] : ""),
    porDoSol: soAHora_(diario.sunset ? diario.sunset[0] : ""),
    dias: dias,
  };
}

function soAHora_(iso) {
  var m = String(iso || "").match(/T(\d{2}:\d{2})/);
  return m ? m[1] : "";
}

// ---------------------------------------------------------------
// Firestore (REST, autenticado pelo token do próprio script)
// ---------------------------------------------------------------

function urlDoc_(projectId) {
  return (
    "https://firestore.googleapis.com/v1/projects/" + projectId +
    "/databases/(default)/documents/" + COLECAO + "/" + DOCUMENTO
  );
}

function lerPublicado_(projectId) {
  var resposta = UrlFetchApp.fetch(urlDoc_(projectId), {
    method: "get",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (resposta.getResponseCode() !== 200) return null; // 404 na primeira vez
  var doc = JSON.parse(resposta.getContentText());
  var texto = doc.fields && doc.fields.dados && doc.fields.dados.stringValue;
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch (e) {
    return null;
  }
}

function gravarPublicado_(projectId, dados) {
  var corpo = {
    fields: {
      // JSON dentro de um campo de texto: ver a nota sobre o formato
      // REST no cabeçalho deste arquivo.
      dados: { stringValue: JSON.stringify(dados) },
      atualizadoEm: { timestampValue: new Date().toISOString() },
      // Ajuda a depurar sem abrir o JSON inteiro.
      quantidade: { integerValue: String(Object.keys(dados).length) },
    },
  };

  var resposta = UrlFetchApp.fetch(urlDoc_(projectId), {
    method: "patch",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true,
  });

  var codigo = resposta.getResponseCode();
  if (codigo < 200 || codigo >= 300) {
    throw new Error(
      "Firestore recusou o PATCH de clima/atual (HTTP " + codigo + "): " +
      resposta.getContentText()
    );
  }
}
