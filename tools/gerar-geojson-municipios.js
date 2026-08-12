/**
 * Escreve data/rj-municipios.geojson a partir da malha do IBGE.
 *
 * PRA QUE SERVE ESSE ARQUIVO: o app o carrega em tempo de execução
 * (carregarGeoJsonMunicipios em js/script.js) e usa os polígonos pra
 * decidir, por ponto-em-polígono, se a pessoa está mesmo dentro do
 * município na hora de confirmar uma visita por GPS.
 *
 * POR QUE FOI TROCADO: ele era uma versão simplificada, com 9.416
 * pontos pros 92 municípios -- Nilópolis inteiro era um polígono de
 * DOZE lados. Pra desenhar de longe dava conta; pra dizer "você está
 * dentro" não dá: perto de divisa, um contorno de doze lados erra por
 * centenas de metros, e erra pros dois lados (nega quem está dentro e
 * aceita quem está fora).
 *
 * O FORMATO É DE PROPÓSITO IGUAL AO ANTIGO: `properties.id` e um
 * Polygon com a lista chapada de anéis. O IBGE entrega MultiPolygon
 * (município com ilha vira vários polígonos) e só o campo `codarea`;
 * achatar é o que mantém o app funcionando sem tocar em js/script.js.
 *
 * PRECISÃO: a malha do IBGE já vem com 4 casas decimais (~11 m nesta
 * latitude). Não vale a pena arredondar mais -- o próprio GPS do
 * celular erra mais que isso -- nem faz sentido guardar mais casas do
 * que a fonte tem.
 *
 *   node tools/gerar-geojson-municipios.js
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const ENTRADA = path.join(__dirname, "dados-origem", "rj-municipios-ibge.geojson");
const NOMES = path.join(RAIZ, "data", "destinos.json");
const SAIDA = path.join(RAIZ, "data", "rj-municipios.geojson");

function aneisDe(geometria) {
  if (geometria.type === "Polygon") return geometria.coordinates;
  if (geometria.type === "MultiPolygon") return geometria.coordinates.flat();
  return [];
}

const ibge = JSON.parse(fs.readFileSync(ENTRADA, "utf8"));
const nomesPorCodigo = JSON.parse(fs.readFileSync(NOMES, "utf8"));

let pontos = 0;
const features = ibge.features.map((feature) => {
  const codigoIbge = String(feature.properties.codarea);
  const nome = nomesPorCodigo[codigoIbge]?.nome;
  if (!nome) throw new Error(`Município ${codigoIbge} não está em data/destinos.json`);

  const aneis = aneisDe(feature.geometry);
  aneis.forEach((anel) => (pontos += anel.length));

  return {
    type: "Feature",
    // `description` existia no arquivo antigo e ninguém lê. Fica de
    // fora: são 92 cópias do nome, e o arquivo já cresceu bastante.
    properties: { id: codigoIbge, name: nome },
    geometry: { type: "Polygon", coordinates: aneis },
  };
});

features.sort((a, b) => a.properties.name.localeCompare(b.properties.name, "pt-BR"));

const antes = fs.existsSync(SAIDA) ? fs.statSync(SAIDA).size : 0;
fs.writeFileSync(SAIDA, JSON.stringify({ type: "FeatureCollection", features }));
const depois = fs.statSync(SAIDA).size;

console.log(`${features.length} municípios, ${pontos} pontos -> ${path.relative(RAIZ, SAIDA)}`);
console.log(`tamanho: ${(antes / 1024).toFixed(0)} KB -> ${(depois / 1024).toFixed(0)} KB`);
