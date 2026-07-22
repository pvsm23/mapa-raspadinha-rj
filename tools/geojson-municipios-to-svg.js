/**
 * Converte um geojson de municípios (WGS84) em um <svg> com um <path>
 * por município, usando o código IBGE como id/data-municipio. Mesma
 * projeção equiretangular com correção de cos(lat média) usada em
 * geojson-to-svg.js (o gerador original do RJ) — só que aqui é
 * parametrizado por sigla de estado, pra rodar pro RJ, SP ou qualquer
 * outro que a gente for adicionando depois.
 *
 * Diferenças do gerador do RJ:
 * - Aceita Polygon E MultiPolygon (SP tem municípios com ilhas).
 * - data-regiao é opcional: se o arquivo de regiões estiver vazio ou
 *   não cobrir o município, o atributo simplesmente não sai.
 * - Não trava se algum município não estiver em nenhuma região (o RJ
 *   travava porque as 8 regiões cobrem os 92 munícípios; SP começa
 *   sem regiões preenchidas).
 *
 * Uso: node tools/geojson-municipios-to-svg.js <sigla>
 *      Ex: node tools/geojson-municipios-to-svg.js sp
 *
 * Lê:   data/<sigla>-municipios.geojson
 *       data/<sigla>-regioes.json (opcional; se {} ou não existir, ignora)
 * Gera: assets/svg/<sigla>-municipios.svg
 */

const fs = require("fs");
const path = require("path");

const sigla = (process.argv[2] || "").toLowerCase();
if (!sigla) {
  console.error("Uso: node tools/geojson-municipios-to-svg.js <sigla>");
  process.exit(1);
}

const RAIZ = path.join(__dirname, "..");
const ENTRADA = path.join(RAIZ, "data", `${sigla}-municipios.geojson`);
const REGIOES = path.join(RAIZ, "data", `${sigla}-regioes.json`);
const SAIDA = path.join(RAIZ, "assets", "svg", `${sigla}-municipios.svg`);

const LARGURA_SVG = 800;
const CASAS_DECIMAIS = 2;

const geojson = JSON.parse(fs.readFileSync(ENTRADA, "utf8"));

let idParaRegiao = {};
if (fs.existsSync(REGIOES)) {
  const regioesJson = JSON.parse(fs.readFileSync(REGIOES, "utf8"));
  for (const [regiaoId, dados] of Object.entries(regioesJson)) {
    (dados.municipios || []).forEach((codigoIbge) => {
      idParaRegiao[codigoIbge] = regiaoId;
    });
  }
}

function poligonosDaFeature(feature) {
  if (feature.geometry.type === "Polygon") return [feature.geometry.coordinates];
  if (feature.geometry.type === "MultiPolygon") return feature.geometry.coordinates;
  throw new Error(`Tipo de geometria inesperado: ${feature.geometry.type}`);
}

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
    largura: maxX - minX,
  };
}

const featuresOrdenadas = geojson.features
  .slice()
  .sort((a, b) => a.properties.name.localeCompare(b.properties.name, "pt-BR"));

const paths = featuresOrdenadas
  .map((feature) => {
    const codigoIbge = feature.properties.id;
    const nome = feature.properties.name;
    const regiaoId = idParaRegiao[codigoIbge];
    const dRegiao = regiaoId ? ` data-regiao="${regiaoId}"` : "";
    const d = poligonosDaFeature(feature).flat().map(anelParaPathD).join(" ");
    return (
      `  <path id="mun-${codigoIbge}" data-municipio="${codigoIbge}" ` +
      `data-nome="${escaparAtributo(nome)}"${dRegiao} class="municipio" d="${d}" />`
    );
  })
  .join("\n");

const rotulos = featuresOrdenadas
  .map((feature) => {
    const codigoIbge = feature.properties.id;
    const nome = feature.properties.name;
    const { x, y, largura } = centroDoBoundingBox(feature);
    const fonte = Math.max(3.5, Math.min(6, largura / 8));
    return (
      `  <text class="rotulo-municipio" x="${x}" y="${y}" ` +
      `font-size="${fonte.toFixed(1)}" pointer-events="none">` +
      `${escaparAtributo(nome)}</text>`
    );
  })
  .join("\n");

const svg =
  `<svg id="mapa-${sigla}" viewBox="0 0 ${LARGURA_SVG} ${alturaSvg.toFixed(CASAS_DECIMAIS)}" ` +
  `xmlns="http://www.w3.org/2000/svg">\n${paths}\n${rotulos}\n</svg>\n`;

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(SAIDA, svg, "utf8");

console.log(`OK: ${geojson.features.length} municípios -> ${SAIDA}`);
console.log(`viewBox: 0 0 ${LARGURA_SVG} ${alturaSvg.toFixed(CASAS_DECIMAIS)}`);
console.log(`tamanho do arquivo: ${(svg.length / 1024).toFixed(1)} KB`);
