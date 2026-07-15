/**
 * Converte data/br-estados.geojson (GeoJSON, WGS84, malha de UFs da
 * API oficial do IBGE) em um <svg> com um <path> por estado, usando o
 * código UF (2 dígitos) como id/data-estado. Cada path também ganha
 * data-sigla (ver data/estados.json).
 *
 * Mesma projeção usada em geojson-to-svg.js (equiretangular simples
 * com correção de cos(latitude média)) -- aqui a área é o Brasil
 * inteiro, então essa aproximação é mais grosseira que no mapa do RJ,
 * mas é suficiente pro propósito desta visão (contorno "em breve",
 * não navegação de precisão).
 *
 * Trata tanto Polygon quanto MultiPolygon (estados com ilhas, como
 * Pernambuco/Fernando de Noronha, vêm como MultiPolygon na malha do
 * IBGE -- o conversor do RJ não precisava disso pois nenhum
 * município do RJ tem geometria assim).
 *
 * Uso: node tools/br-estados-to-svg.js
 * Gera: assets/svg/br-estados.svg
 */

const fs = require("fs");
const path = require("path");

const ENTRADA = path.join(__dirname, "..", "data", "br-estados.geojson");
const ESTADOS = path.join(__dirname, "..", "data", "estados.json");
const SAIDA = path.join(__dirname, "..", "assets", "svg", "br-estados.svg");

const LARGURA_SVG = 800;
const CASAS_DECIMAIS = 2;

const geojson = JSON.parse(fs.readFileSync(ENTRADA, "utf8"));
const estados = JSON.parse(fs.readFileSync(ESTADOS, "utf8"));

// Normaliza pra sempre um array de poligonos, cada um um array de aneis:
// Polygon: coordinates = [anel, anel, ...] -> [[anel, anel, ...]]
// MultiPolygon: coordinates = [poligono, poligono, ...] (já nesse formato)
function poligonosDaFeature(feature) {
  if (feature.geometry.type === "Polygon") return [feature.geometry.coordinates];
  if (feature.geometry.type === "MultiPolygon") return feature.geometry.coordinates;
  throw new Error(`Tipo de geometria inesperado: ${feature.geometry.type}`);
}

// 1. Bounding box em lon/lat
let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
for (const feature of geojson.features) {
  for (const poligono of poligonosDaFeature(feature)) {
    for (const anel of poligono) {
      for (const [lon, lat] of anel) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
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
  const y = alturaSvg - (lat - minLat) * escala;
  return [Number(x.toFixed(CASAS_DECIMAIS)), Number(y.toFixed(CASAS_DECIMAIS))];
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

function centroDoBoundingBox(feature) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poligono of poligonosDaFeature(feature)) {
    for (const anel of poligono) {
      for (const ponto of anel) {
        const [x, y] = projetar(ponto);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    x: Number(((minX + maxX) / 2).toFixed(CASAS_DECIMAIS)),
    y: Number(((minY + maxY) / 2).toFixed(CASAS_DECIMAIS)),
  };
}

const featuresOrdenadas = geojson.features
  .slice()
  .sort((a, b) => a.properties.codarea.localeCompare(b.properties.codarea));

const paths = featuresOrdenadas
  .map((feature) => {
    const codigoUf = feature.properties.codarea;
    const info = estados[codigoUf];
    if (!info) throw new Error(`UF sem cadastro em estados.json: ${codigoUf}`);
    const d = poligonosDaFeature(feature).flat().map(anelParaPathD).join(" ");
    const classes = "estado" + (info.liberado ? " estado-liberado" : " estado-bloqueado");
    return (
      `  <path id="uf-${codigoUf}" data-estado="${codigoUf}" data-sigla="${info.sigla}" ` +
      `data-nome="${escaparAtributo(info.nome)}" class="${classes}" d="${d}" />`
    );
  })
  .join("\n");

const rotulos = featuresOrdenadas
  .map((feature) => {
    const codigoUf = feature.properties.codarea;
    const info = estados[codigoUf];
    const { x, y } = centroDoBoundingBox(feature);
    return (
      `  <text class="rotulo-estado" x="${x}" y="${y}" pointer-events="none">` +
      `${escaparAtributo(info.sigla)}</text>`
    );
  })
  .join("\n");

const svg =
  `<svg id="mapa-brasil" viewBox="0 0 ${LARGURA_SVG} ${alturaSvg.toFixed(CASAS_DECIMAIS)}" ` +
  `xmlns="http://www.w3.org/2000/svg">\n${paths}\n${rotulos}\n</svg>\n`;

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(SAIDA, svg, "utf8");

console.log(`OK: ${geojson.features.length} estados -> ${SAIDA}`);
console.log(`viewBox: 0 0 ${LARGURA_SVG} ${alturaSvg.toFixed(CASAS_DECIMAIS)}`);
console.log(`tamanho do arquivo: ${(svg.length / 1024).toFixed(1)} KB`);
