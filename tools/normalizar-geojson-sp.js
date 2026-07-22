/**
 * Normaliza data/sp-municipios.geojson (baixado da API v3 do IBGE, que
 * traz só properties.codarea) pra ficar no mesmo formato do
 * rj-municipios.geojson: properties = { id, name, description }.
 *
 * Junta com data/sp-municipios-nomes.json (API v1 do IBGE, que traz
 * id + nome + mesorregião) pra preencher o campo name.
 *
 * Uso: node tools/normalizar-geojson-sp.js
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const GEOJSON = path.join(RAIZ, "data", "sp-municipios.geojson");
const NOMES = path.join(RAIZ, "data", "sp-municipios-nomes.json");

const geojson = JSON.parse(fs.readFileSync(GEOJSON, "utf8"));
const nomes = JSON.parse(fs.readFileSync(NOMES, "utf8"));

const idParaNome = {};
for (const m of nomes) {
  idParaNome[String(m.id)] = m.nome;
}

let semNome = 0;
for (const feature of geojson.features) {
  const codigo = String(feature.properties.codarea);
  const nome = idParaNome[codigo];
  if (!nome) {
    semNome++;
    continue;
  }
  feature.properties = { id: codigo, name: nome, description: nome };
}

fs.writeFileSync(GEOJSON, JSON.stringify(geojson), "utf8");

console.log(`Features: ${geojson.features.length}`);
console.log(`Sem nome: ${semNome}`);
console.log(`OK: ${GEOJSON}`);
