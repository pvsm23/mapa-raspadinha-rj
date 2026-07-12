/**
 * Converte data/rj-municipios.geojson (GeoJSON, WGS84) em um <svg> com
 * um <path> por municipio, mantendo o codigo IBGE como id/data-municipio
 * (mesma convencao usada no mapa de teste da Etapa 1).
 *
 * Projecao: equiretangular simples com correcao de cos(latitude media),
 * suficiente para uma area pequena como o estado do RJ.
 *
 * Uso: node tools/geojson-to-svg.js
 * Gera: assets/svg/rj-municipios.svg
 */

const fs = require("fs");
const path = require("path");

const ENTRADA = path.join(__dirname, "..", "data", "rj-municipios.geojson");
const SAIDA = path.join(__dirname, "..", "assets", "svg", "rj-municipios.svg");

const LARGURA_SVG = 800;
const CASAS_DECIMAIS = 2;

const geojson = JSON.parse(fs.readFileSync(ENTRADA, "utf8"));

// 1. Bounding box em lon/lat
let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
for (const feature of geojson.features) {
  for (const anel of feature.geometry.coordinates) {
    for (const [lon, lat] of anel) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
}

const latMedia = (minLat + maxLat) / 2;
const correcaoLon = Math.cos((latMedia * Math.PI) / 180);

const larguraGeo = (maxLon - minLon) * correcaoLon;
const alturaGeo = maxLat - minLat;
const escala = LARGURA_SVG / larguraGeo;
const alturaSvg = alturaGeo * escala;

function projetar([lon, lat]) {
  const x = (lon - minLon) * correcaoLon * escala;
  const y = alturaSvg - (lat - minLat) * escala; // inverte Y (lat cresce p/ norte, SVG cresce p/ baixo)
  return [
    Number(x.toFixed(CASAS_DECIMAIS)),
    Number(y.toFixed(CASAS_DECIMAIS)),
  ];
}

function anelParaPathD(anel) {
  const pontos = anel.map(projetar);
  const [primeiroX, primeiroY] = pontos[0];
  let d = `M ${primeiroX} ${primeiroY} `;
  for (let i = 1; i < pontos.length; i++) {
    d += `L ${pontos[i][0]} ${pontos[i][1]} `;
  }
  return d + "Z";
}

function escaparAtributo(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const paths = geojson.features
  .slice()
  .sort((a, b) => a.properties.name.localeCompare(b.properties.name, "pt-BR"))
  .map((feature) => {
    const codigoIbge = feature.properties.id;
    const nome = feature.properties.name;
    const d = feature.geometry.coordinates.map(anelParaPathD).join(" ");
    return (
      `  <path id="mun-${codigoIbge}" data-municipio="${codigoIbge}" ` +
      `data-nome="${escaparAtributo(nome)}" class="municipio" d="${d}" />`
    );
  })
  .join("\n");

const svg =
  `<svg id="mapa-rj" viewBox="0 0 ${LARGURA_SVG} ${alturaSvg.toFixed(CASAS_DECIMAIS)}" ` +
  `xmlns="http://www.w3.org/2000/svg">\n${paths}\n</svg>\n`;

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(SAIDA, svg, "utf8");

console.log(`OK: ${geojson.features.length} municipios -> ${SAIDA}`);
console.log(`viewBox: 0 0 ${LARGURA_SVG} ${alturaSvg.toFixed(CASAS_DECIMAIS)}`);
console.log(`tamanho do arquivo: ${(svg.length / 1024).toFixed(1)} KB`);
