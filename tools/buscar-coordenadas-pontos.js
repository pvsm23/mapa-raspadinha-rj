/**
 * Busca no Nominatim (OpenStreetMap) a coordenada de cada ponto
 * turístico de data/destinos.json e grava `lat`/`lon` no próprio ponto.
 *
 *   node tools/buscar-coordenadas-pontos.js metropolitana
 *   node tools/buscar-coordenadas-pontos.js 3304557 3303302
 *   node tools/buscar-coordenadas-pontos.js --tudo
 *
 * As coordenadas existem pra POSICIONAR o ícone no mapa (ver
 * projetarCoordenada em js/script.js) -- não são mostradas pra ninguém.
 *
 * POR QUE NOMINATIM: é gratuito e não pede chave, ao contrário da API
 * de geocodificação do Google. A política de uso deles pede no máximo
 * UMA consulta por segundo e um User-Agent que identifique quem chama;
 * as duas coisas estão respeitadas aqui, e é por isso que o script
 * demora ~1s por ponto em vez de disparar tudo de uma vez.
 *
 * NEM TODO PONTO RESOLVE, e isso é esperado: nome genérico ("Centro
 * Histórico", "Igreja Matriz") ou coisa que é região e não endereço
 * ("Margens do Rio Paraíba do Sul") não tem um lugar único pra achar.
 * Esses ficam sem coordenada, e sem coordenada o ponto simplesmente não
 * ganha ícone no mapa -- melhor do que um ícone no lugar errado.
 *
 * CONFERE O MUNICÍPIO PELO POLÍGONO, não pelo endereço: o resultado só
 * é aceito se a coordenada cair DENTRO dos limites reais do município
 * (data/rj-municipios.geojson, malha do IBGE). Sem checagem nenhuma,
 * "Praia Grande" em Angra dos Reis cairia na Praia Grande de São Paulo
 * e o ícone apareceria fora do estado sem ninguém perceber.
 *
 * A primeira versão disto comparava o TEXTO do endereço devolvido, e
 * era frágil dos dois lados: recusava lugar certo quando o Nominatim
 * respondia com o distrito em vez do município, e aceitaria um
 * homônimo cujo endereço por acaso citasse o nome. O polígono é a
 * pergunta que a gente realmente quer fazer -- "esse ponto fica dentro
 * desta cidade?" -- e responde sem depender de como o texto veio.
 *
 * Guarda o texto escolhido em `_geo` só pra auditoria: dá pra abrir o
 * JSON e ver de onde saiu cada coordenada. Ninguém lê isso em runtime.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const RAIZ = path.join(__dirname, "..");
const DESTINOS = path.join(RAIZ, "data", "destinos.json");
const REGIOES = path.join(RAIZ, "data", "regioes.json");
const LIMITES = path.join(RAIZ, "data", "rj-municipios.geojson");

const AGENTE = "DesbravaApp/0.26 (app de turismo do RJ; contato eupaulovitorsm01@gmail.com)";
const ESPERA_MS = 1100; // política do Nominatim: no máximo 1 por segundo

/** Ponto dentro do polígono (raio par/ímpar), igual ao que o app usa. */
function dentroDoPoligono(lon, lat, aneis) {
  let dentro = false;
  for (const anel of aneis) {
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [xi, yi] = anel[i];
      const [xj, yj] = anel[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
  }
  return dentro;
}

/** Caixa que envolve o município, no formato que o Nominatim espera. */
function caixaDe(aneis) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const anel of aneis) {
    for (const [lo, la] of anel) {
      if (lo < minLon) minLon = lo;
      if (lo > maxLon) maxLon = lo;
      if (la < minLat) minLat = la;
      if (la > maxLat) maxLat = la;
    }
  }
  return `${minLon},${maxLat},${maxLon},${minLat}`;
}

function buscar(consulta, caixa) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=br&addressdetails=1" +
    // `bounded=1` obriga o resultado a estar dentro da caixa. É o que
    // salva os nomes repetidos pelo Brasil inteiro ("Estação
    // Ferroviária", "Praça da Matriz"): sem limitar a área, o primeiro
    // resultado vem de outro estado e o polígono descarta tudo.
    (caixa ? `&viewbox=${caixa}&bounded=1` : "") +
    "&q=" +
    encodeURIComponent(consulta);
  return new Promise((resolve) => {
    https
      .get(url, { headers: { "User-Agent": AGENTE } }, (res) => {
        let s = "";
        res.on("data", (d) => (s += d));
        res.on("end", () => {
          try {
            resolve(JSON.parse(s));
          } catch {
            resolve([]);
          }
        });
      })
      .on("error", () => resolve([]));
  });
}

/**
 * Formas de perguntar pelo mesmo lugar, da mais específica pra mais
 * solta. O parêntese sai porque costuma carregar a parte mais precisa
 * ("Serra dos Órgãos (Sede Guapimirim)") mas atrapalha a busca como
 * pontuação; e a última tentativa larga o município, pro caso de o
 * lugar estar cadastrado só pelo nome -- aí o polígono é que decide se
 * serve.
 */
function consultasPara(nomePonto, nomeMunicipio) {
  const limpo = nomePonto.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  const semParenteses = nomePonto.replace(/\s*\([^)]*\)/g, "").trim();
  /* Só variações do NOME COMPLETO, sempre com o município junto.
   *
   * Cheguei a tentar uma busca "solta" limitada à caixa do município
   * (`viewbox` + `bounded=1`) pra pescar os que faltavam, e ela é uma
   * ARMADILHA: sem correspondência exata, o Nominatim devolve o que for
   * parecido dentro da área. "Estação Ferroviária" limitada a Japeri
   * volta "Aljezur, Rua Nossa Senhora da Conceição" -- um endereço
   * qualquer, que está de fato dentro do polígono e passaria na
   * validação. O ícone iria pra uma rua ao acaso e ninguém perceberia.
   *
   * Ponto sem resultado fica SEM COORDENADA de propósito: no mapa ele
   * simplesmente não aparece, e isso é melhor que aparecer no lugar
   * errado. */
  return [...new Set([`${nomePonto}, ${nomeMunicipio}, RJ`, `${limpo}, ${nomeMunicipio}, RJ`, `${semParenteses}, ${nomeMunicipio}, RJ`])].map((q) => ({
    q,
    limitar: false,
  }));
}

async function coordenadaDe(nomePonto, nomeMunicipio, aneis, aoConsultar) {
  const caixa = caixaDe(aneis);
  for (const { q, limitar } of consultasPara(nomePonto, nomeMunicipio)) {
    const resultados = await buscar(q, limitar ? caixa : null);
    await aoConsultar();
    // A caixa é retangular e o município não: o polígono continua sendo
    // a palavra final mesmo nas buscas limitadas.
    const bom = resultados.find((r) => dentroDoPoligono(Number(r.lon), Number(r.lat), aneis));
    if (bom) {
      return {
        lat: Number(Number(bom.lat).toFixed(6)),
        lon: Number(Number(bom.lon).toFixed(6)),
        onde: String(bom.display_name || "").slice(0, 80),
      };
    }
  }
  return null;
}

(async () => {
  const destinos = JSON.parse(fs.readFileSync(DESTINOS, "utf8"));
  const regioes = JSON.parse(fs.readFileSync(REGIOES, "utf8"));
  const limites = {};
  for (const f of JSON.parse(fs.readFileSync(LIMITES, "utf8")).features) {
    limites[f.properties.id] = f.geometry.coordinates;
  }
  const args = process.argv.slice(2);

  let ids;
  if (args.includes("--tudo")) ids = Object.keys(destinos);
  else {
    ids = [];
    for (const a of args) {
      if (/^\d{7}$/.test(a)) ids.push(a);
      else if (regioes[a]) ids.push(...regioes[a].municipios.map(String));
    }
  }
  if (!ids.length) {
    console.error("uso: node tools/buscar-coordenadas-pontos.js <regiao|codigoIbge|--tudo>");
    process.exit(1);
  }

  const falhou = [];
  let achou = 0;
  let pulou = 0;

  const respirar = () => new Promise((res) => setTimeout(res, ESPERA_MS));

  for (const id of ids) {
    const municipio = destinos[id];
    if (!municipio) continue;
    const aneis = limites[id];
    if (!aneis) {
      console.error(`  !!   ${id} sem limites em ${path.basename(LIMITES)} -- pulando`);
      continue;
    }
    for (const ponto of municipio.destinos || []) {
      if (typeof ponto.lat === "number") {
        pulou++;
        continue;
      }
      const r = await coordenadaDe(ponto.nome, municipio.nome, aneis, respirar);
      if (r) {
        ponto.lat = r.lat;
        ponto.lon = r.lon;
        ponto._geo = r.onde;
        achou++;
        console.log(`  ok   ${municipio.nome} / ${ponto.nome}  ->  ${r.lat}, ${r.lon}`);
      } else {
        falhou.push(`${municipio.nome} / ${ponto.nome}`);
        console.log(`  --   ${municipio.nome} / ${ponto.nome}  (sem resultado no município)`);
      }
      await new Promise((res) => setTimeout(res, ESPERA_MS));
    }
  }

  fs.writeFileSync(DESTINOS, JSON.stringify(destinos, null, 2) + "\n");

  console.log(`\nachou ${achou} | ja tinha ${pulou} | sem coordenada ${falhou.length}`);
  if (falhou.length) {
    console.log("\nSEM COORDENADA (ficam sem icone no mapa ate alguem colar a do Maps):");
    falhou.forEach((f) => console.log("  - " + f));
  }
})();
