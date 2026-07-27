/**
 * Background Runner do Desbrava: roda ISOLADO do app principal (sem
 * DOM, sem acesso a window/script.js), disparado pelo próprio Android a
 * cada ~60 minutos ENQUANTO O APP ESTIVER EM SEGUNDO PLANO (minimizado
 * -- se o app for fechado à força/removido dos recentes, o Android mata
 * o processo e nada roda mais, isso é limitação do próprio sistema, não
 * dá pra contornar via JS). Ver capacitor.config.json (seção
 * BackgroundRunner) e configurarRastreamentoFundo em js/script.js.
 *
 * Fluxo:
 * 1. "sincronizarProgressoDesbrava" -- o app principal manda (via
 *    dispatchEvent) a lista de municípios já verificados, sempre que
 *    ela muda. Grava no CapacitorKV (só persistência disponível aqui).
 * 2. "atualizarRastreioAtivo" -- liga/desliga o rastreio (o toggle de
 *    Configurações manda isso). Sem essa flag ligada, a checagem
 *    periódica desiste na hora sem gastar GPS/rede.
 * 3. "checarLocalizacaoDesbrava" -- disparado pelo agendador do
 *    Android a cada ~60 min: pega a posição atual, descobre em que
 *    município ela cai (mesmo ray casting do app principal,
 *    reimplementado aqui pq o runner não importa nada de fora) e, se
 *    for um município NOVO (ainda não verificado nem notificado antes),
 *    dispara uma notificação local. Cada notificação usa o próprio
 *    código IBGE como id -- ao tocar nela, o app abre e o listener
 *    "backgroundRunnerNotificationReceived" (js/script.js) sabe qual
 *    município era só pelo id, e abre o popup dele direto (mesmo fluxo
 *    do link "?municipio=", ver abrirMunicipioDoLinkSeExistir).
 *
 * LIMITAÇÃO HONESTA: só fica sabendo de um município se a pessoa TOCAR
 * na notificação -- não existe, na API pública deste plugin, um jeito
 * do app principal ler o CapacitorKV de fora do runner. Por isso a
 * notificação fica na bandeja até ser tocada (autoCancel, não some
 * sozinha), em vez de um "toast" que desaparece.
 */

const CHAVE_ATIVO = "desbrava_rastreio_ativo";
const CHAVE_VISITADOS = "desbrava_municipios_visitados";
const CHAVE_NOTIFICADOS = "desbrava_municipios_notificados";
const URL_GEOJSON = "https://pvsm23.github.io/mapa-raspadinha-rj/data/rj-municipios.geojson";

/** Ray casting clássico -- mesma lógica de pontoDentroDoPoligono em
 * js/script.js, reimplementada aqui (o runner não importa outros arquivos). */
function pontoDentroDoAnel(lon, lat, anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const xi = anel[i][0], yi = anel[i][1];
    const xj = anel[j][0], yj = anel[j][1];
    const intersecta = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersecta) dentro = !dentro;
  }
  return dentro;
}

function encontrarMunicipio(lon, lat, geojson) {
  for (const feature of geojson.features) {
    const aneis =
      feature.geometry.type === "Polygon" ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
    for (const anel of aneis) {
      if (pontoDentroDoAnel(lon, lat, anel)) {
        return { id: String(feature.properties.id), nome: feature.properties.name };
      }
    }
  }
  return null;
}

function lerListaKV(chave) {
  try {
    const bruto = CapacitorKV.get(chave).value;
    return bruto ? JSON.parse(bruto) : [];
  } catch (erro) {
    return [];
  }
}

addEventListener("atualizarRastreioAtivo", (resolve, reject, args) => {
  try {
    CapacitorKV.set(CHAVE_ATIVO, args && args.ativo ? "1" : "0");
    resolve();
  } catch (erro) {
    reject(erro);
  }
});

addEventListener("sincronizarProgressoDesbrava", (resolve, reject, args) => {
  try {
    const visitados = (args && args.visitados) || [];
    CapacitorKV.set(CHAVE_VISITADOS, JSON.stringify(visitados));
    resolve();
  } catch (erro) {
    reject(erro);
  }
});

addEventListener("checarLocalizacaoDesbrava", async (resolve, reject) => {
  try {
    const ativo = CapacitorKV.get(CHAVE_ATIVO).value;
    if (ativo !== "1") {
      resolve();
      return;
    }

    const posicao = CapacitorGeolocation.getCurrentPosition();
    if (!posicao || typeof posicao.latitude !== "number") {
      resolve();
      return;
    }

    const resposta = await fetch(URL_GEOJSON);
    const geojson = await resposta.json();
    const encontrado = encontrarMunicipio(posicao.longitude, posicao.latitude, geojson);
    if (!encontrado) {
      resolve();
      return;
    }

    const visitados = lerListaKV(CHAVE_VISITADOS);
    if (visitados.includes(encontrado.id)) {
      resolve();
      return;
    }

    const notificados = lerListaKV(CHAVE_NOTIFICADOS);
    if (notificados.includes(encontrado.id)) {
      resolve();
      return;
    }

    CapacitorNotifications.schedule([
      {
        id: Number(encontrado.id),
        title: "📍 Novo município detectado!",
        body: `Você esteve em ${encontrado.nome}. Toque pra abrir e raspar o selo.`,
        autoCancel: true,
      },
    ]);

    notificados.push(encontrado.id);
    CapacitorKV.set(CHAVE_NOTIFICADOS, JSON.stringify(notificados));

    resolve();
  } catch (erro) {
    reject(erro);
  }
});
