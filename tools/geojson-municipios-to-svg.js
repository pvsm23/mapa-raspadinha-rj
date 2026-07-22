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
let idParaCor = {};
let regioesInfo = {}; // slug -> { nome, cor }
if (fs.existsSync(REGIOES)) {
  const regioesJson = JSON.parse(fs.readFileSync(REGIOES, "utf8"));
  for (const [regiaoId, dados] of Object.entries(regioesJson)) {
    regioesInfo[regiaoId] = { nome: dados.nome, cor: dados.cor };
    (dados.municipios || []).forEach((codigoIbge) => {
      idParaRegiao[codigoIbge] = regiaoId;
      if (dados.cor !== undefined) idParaCor[codigoIbge] = dados.cor;
    });
  }
}
const temRegioes = Object.keys(regioesInfo).length > 0;

// Tolerância (em px do viewBox de 800 de largura) do Douglas-Peucker.
// 0 desliga a simplificação. Ajustado pra tirar ~40% dos pontos da
// malha de SP sem estragar as bordas no zoom normal (ver contagem no
// fim). Passe SIMPLIFICAR=0 no ambiente pra gerar sem simplificar.
const EPS_SIMPLIFICACAO =
  process.env.SIMPLIFICAR !== undefined ? Number(process.env.SIMPLIFICAR) : 0.35;

// Contadores globais de pontos, só pra reportar o quanto simplificou.
let pontosAntes = 0;
let pontosDepois = 0;

/**
 * Distância perpendicular do ponto p ao segmento a-b (px projetados).
 */
function distPerpendicular(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Douglas-Peucker: reduz pontos de uma polilinha mantendo o formato
 * (descarta pontos a menos de `eps` da reta entre os extremos). Iterativo
 * (pilha) pra não estourar a recursão em anéis com muitos pontos.
 */
function douglasPeucker(pontos, eps) {
  const n = pontos.length;
  if (n < 3 || eps <= 0) return pontos;
  const manter = new Array(n).fill(false);
  manter[0] = manter[n - 1] = true;
  const pilha = [[0, n - 1]];
  while (pilha.length) {
    const [ini, fim] = pilha.pop();
    let maxD = 0, idx = -1;
    for (let i = ini + 1; i < fim; i++) {
      const d = distPerpendicular(pontos[i], pontos[ini], pontos[fim]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx !== -1) {
      manter[idx] = true;
      pilha.push([ini, idx], [idx, fim]);
    }
  }
  return pontos.filter((_, i) => manter[i]);
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

// Constrói o `d` de um anel JÁ projetado, simplificando com Douglas-Peucker.
function anelParaPathDeProjetado(projetados) {
  pontosAntes += projetados.length;
  const pontos = douglasPeucker(projetados, EPS_SIMPLIFICACAO);
  pontosDepois += pontos.length;
  const [primeiroX, primeiroY] = pontos[0];
  let d = `M ${primeiroX} ${primeiroY} `;
  for (let i = 1; i < pontos.length; i++) {
    d += `L ${pontos[i][0]} ${pontos[i][1]} `;
  }
  return d + "Z";
}

/* ---- Contornos de região (divisas), calculados no BUILD ----
   Uma aresta (par de vértices vizinhos de um município) é INTERNA a uma
   região se dois municípios DA MESMA região a compartilham -- nesse caso
   não é divisa. As demais (entre regiões diferentes, ou na borda do
   estado) são desenhadas. Usa a geometria COMPLETA (antes do
   Douglas-Peucker) e casamento EXATO de vértices: na malha do IBGE os
   municípios vizinhos compartilham vértices idênticos, então depois de
   projetar+arredondar as arestas batem exatamente -- o que NÃO valeria
   se a gente casasse a geometria já simplificada (o DP move/remove
   vértices de forma diferente em cada lado). Resultado embutido no SVG
   como <g class="contornos-regioes">, mostrado só no modo regiões. */
const arestasContorno = new Map(); // chave "ax,ay;bx,by" -> { p1, p2, regioes: [] }

function coletarArestasDeAnel(projetados, regiao) {
  const n = projetados.length;
  for (let i = 0; i < n; i++) {
    const a = projetados[i];
    const b = projetados[(i + 1) % n];
    const ka = `${a[0]},${a[1]}`;
    const kb = `${b[0]},${b[1]}`;
    if (ka === kb) continue;
    const chave = ka < kb ? `${ka};${kb}` : `${kb};${ka}`;
    let e = arestasContorno.get(chave);
    if (!e) { e = { p1: a, p2: b, regioes: [] }; arestasContorno.set(chave, e); }
    e.regioes.push(regiao);
  }
}

function construirPathDeContornos() {
  const segmentos = [];
  for (const e of arestasContorno.values()) {
    const contagem = {};
    let interna = false;
    for (const r of e.regioes) {
      contagem[r] = (contagem[r] || 0) + 1;
      if (contagem[r] >= 2) { interna = true; break; }
    }
    if (interna) continue;
    segmentos.push(`M ${e.p1[0]} ${e.p1[1]} L ${e.p2[0]} ${e.p2[1]}`);
  }
  return segmentos;
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
    const cor = idParaCor[codigoIbge];
    const dRegiao = regiaoId ? ` data-regiao="${regiaoId}"` : "";
    const dCor = cor !== undefined ? ` data-cor="${cor}"` : "";
    const d = poligonosDaFeature(feature)
      .flat()
      .map((anel) => {
        const projetados = anel.map(projetar);
        // Coleta arestas da geometria COMPLETA (pros contornos de região),
        // antes de simplificar o preenchimento.
        if (regiaoId) coletarArestasDeAnel(projetados, regiaoId);
        return anelParaPathDeProjetado(projetados);
      })
      .join(" ");
    return (
      `  <path id="mun-${codigoIbge}" data-municipio="${codigoIbge}" ` +
      `data-nome="${escaparAtributo(nome)}"${dRegiao}${dCor} class="municipio" d="${d}" />`
    );
  })
  .join("\n");

// Rótulos das regiões (mesorregiões), mostrados só no "modo regiões"
// (mapa afastado, ver CSS). Posição = centro do bounding box de TODOS
// os municípios daquela região.
const regiaoBBox = {};
for (const feature of geojson.features) {
  const slug = idParaRegiao[feature.properties.id];
  if (!slug) continue;
  const bb = (regiaoBBox[slug] = regiaoBBox[slug] || {
    minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
  });
  for (const poligono of poligonosDaFeature(feature)) {
    for (const anel of poligono) {
      for (const ponto of anel) {
        const [x, y] = projetar(ponto);
        if (x < bb.minX) bb.minX = x;
        if (x > bb.maxX) bb.maxX = x;
        if (y < bb.minY) bb.minY = y;
        if (y > bb.maxY) bb.maxY = y;
      }
    }
  }
}
const rotulosRegioes = Object.entries(regioesInfo)
  .map(([slug, info]) => {
    const bb = regiaoBBox[slug];
    if (!bb) return "";
    const x = ((bb.minX + bb.maxX) / 2).toFixed(CASAS_DECIMAIS);
    const y = ((bb.minY + bb.maxY) / 2).toFixed(CASAS_DECIMAIS);
    return (
      `  <text class="rotulo-regiao" data-cor="${info.cor}" x="${x}" y="${y}" ` +
      `pointer-events="none">${escaparAtributo(info.nome)}</text>`
    );
  })
  .filter(Boolean)
  .join("\n");

const rotulos = featuresOrdenadas
  .map((feature) => {
    const codigoIbge = feature.properties.id;
    const nome = feature.properties.name;
    const { x, y, largura } = centroDoBoundingBox(feature);
    // Fonte PROPORCIONAL ao tamanho do município: em áreas concentradas
    // (região metropolitana) os municípios são minúsculos, então a letra
    // fica bem pequena e não embola com a vizinha. Piso baixo (1.2) só pra
    // não sumir de vez -- quem quiser ler dá mais zoom (a letra cresce
    // junto com o mapa). Antes o piso era 3.5, gigante pros pequenos.
    const fonte = Math.max(1.2, Math.min(4, largura / 11));
    return (
      `  <text class="rotulo-municipio" x="${x}" y="${y}" ` +
      `font-size="${fonte.toFixed(1)}" pointer-events="none">` +
      `${escaparAtributo(nome)}</text>`
    );
  })
  .join("\n");

const grupoRegioes = rotulosRegioes
  ? `\n  <g id="rotulos-regioes">\n${rotulosRegioes}\n  </g>`
  : "";

// Contornos de região (divisas): um único <path> com todos os segmentos
// de divisa, por cima dos preenchimentos. Visível só no modo regiões (CSS).
const segmentosContorno = temRegioes ? construirPathDeContornos() : [];
const grupoContornos = segmentosContorno.length
  ? `\n  <g class="contornos-regioes"><path class="contorno-regiao-segmento" d="${segmentosContorno.join(" ")}" /></g>`
  : "";

const svg =
  `<svg id="mapa-${sigla}" viewBox="0 0 ${LARGURA_SVG} ${alturaSvg.toFixed(CASAS_DECIMAIS)}" ` +
  `xmlns="http://www.w3.org/2000/svg">\n${paths}${grupoContornos}\n${rotulos}${grupoRegioes}\n</svg>\n`;

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(SAIDA, svg, "utf8");

const reducao = pontosAntes ? (100 * (1 - pontosDepois / pontosAntes)).toFixed(1) : "0";
console.log(`OK: ${geojson.features.length} municípios -> ${SAIDA}`);
console.log(`viewBox: 0 0 ${LARGURA_SVG} ${alturaSvg.toFixed(CASAS_DECIMAIS)}`);
console.log(`regiões: ${Object.keys(regioesInfo).length} (rótulos: ${rotulosRegioes ? "sim" : "não"}, contornos: ${segmentosContorno.length} segmentos)`);
console.log(`simplificação (eps=${EPS_SIMPLIFICACAO}): ${pontosAntes} -> ${pontosDepois} pontos (-${reducao}%)`);
console.log(`tamanho do arquivo: ${(svg.length / 1024).toFixed(1)} KB`);
