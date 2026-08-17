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

/* Tolerância (em unidades do viewBox de 800 de largura) do
 * Douglas-Peucker. 0 desliga. Passe SIMPLIFICAR no ambiente pra mudar.
 *
 * ERA 0.35, E ERA O QUE DEIXAVA SP GROSSEIRO. O Paulo notou que SP não
 * tinha a mesma qualidade do RJ ao aproximar, e a causa não era o
 * download da malha -- era esta linha: 0.35 jogava fora 89% dos pontos.
 *
 * A conta que define o valor certo: o mapa vai até zoom 40x, e o
 * viewBox tem 800 de largura. Nesse zoom, 1 pixel de tela equivale a
 * 800/(800*40) = 0,025 unidades. Ou seja, `eps` É a tolerância em
 * pixels dividida por 0,025:
 *
 *     eps 0.35  ->  14 px de erro no zoom máximo (dava pra ver)
 *     eps 0.10  ->   4 px
 *     eps 0.05  ->   2 px
 *     eps 0.02  ->   0,8 px  <- abaixo de um pixel: invisível
 *
 * Com 0.02 o SVG de MG vai de 849 KB pra 5,6 MB. Isso passou a caber
 * porque os estados grandes DEIXARAM de ir no APK: são baixados sob
 * demanda e guardados no CacheStorage (ver baixarMapaDoEstado em
 * js/script.js). Trocar 5 MB de download único por divisas de verdade
 * no zoom é o negócio certo aqui.
 *
 * O RJ não passa por aqui (tem gerador próprio) e não simplifica nada. */
const EPS_SIMPLIFICACAO =
  process.env.SIMPLIFICAR !== undefined ? Number(process.env.SIMPLIFICAR) : 0.02;

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

/* ---- Onde colocar o nome do município ----
 *
 * O centro do bounding box (centroDoBoundingBox, logo abaixo) é o jeito
 * ingênuo, e ERRA em município côncavo ou em "L": o ponto médio cai num
 * pedaço que pertence ao vizinho. Resende é o caso clássico -- o nome
 * saía fora do próprio desenho.
 *
 * O certo é o "polo de inacessibilidade": o ponto INTERNO mais distante
 * de qualquer borda. Traduzindo pro problema real, é justamente onde
 * sobra mais espaço livre pro texto -- que é o critério que a gente
 * quer, e não "o meio".
 *
 * O algoritmo é o do polylabel (Mapbox): divide o polígono numa grade
 * de células, mede a distância de cada centro até a borda, e vai
 * subdividindo primeiro as células mais promissoras. Uma célula só é
 * descartada quando nem no melhor caso ela poderia bater a campeã
 * atual, o que evita varrer o polígono inteiro.
 */
function distanciaAteBorda(x, y, aneis) {
  let dentro = false;
  let menorDist = Infinity;

  for (const anel of aneis) {
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const a = anel[i];
      const b = anel[j];

      // Point-in-polygon (ray casting). Anéis de buraco invertem o
      // resultado sozinhos, que é o comportamento desejado.
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
        dentro = !dentro;
      }
      menorDist = Math.min(menorDist, distanciaAteSegmento(x, y, a, b));
    }
  }

  // Negativo do lado de fora: assim "maior distância" já significa
  // "bem dentro", sem precisar tratar os dois casos separadamente.
  return (dentro ? 1 : -1) * Math.sqrt(menorDist);
}

/** Distância AO QUADRADO (evita uma raiz por segmento). */
function distanciaAteSegmento(px, py, a, b) {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

function poloDeInacessibilidade(aneis, precisao = 0.6) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of aneis[0]) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const largura = maxX - minX;
  const altura = maxY - minY;
  const lado = Math.min(largura, altura);
  if (lado === 0) return { x: minX, y: minY };

  const novaCelula = (x, y, h) => {
    const d = distanciaAteBorda(x, y, aneis);
    // Teto do que essa célula ainda pode render se for subdividida:
    // o canto mais distante está a h*raiz(2) do centro.
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };

  let melhor = novaCelula(minX + largura / 2, minY + altura / 2, 0);
  const fila = [];
  let h = lado / 2;
  for (let x = minX; x < maxX; x += lado) {
    for (let y = minY; y < maxY; y += lado) {
      fila.push(novaCelula(x + h, y + h, h));
    }
  }

  while (fila.length) {
    // Fila de prioridade simples: a lista é curta o bastante (dezenas
    // de células) pra ordenar não pesar perto do custo das distâncias.
    fila.sort((a, b) => b.max - a.max);
    const celula = fila.shift();

    if (celula.d > melhor.d) melhor = celula;
    if (celula.max - melhor.d <= precisao) continue;

    h = celula.h / 2;
    fila.push(
      novaCelula(celula.x - h, celula.y - h, h),
      novaCelula(celula.x + h, celula.y - h, h),
      novaCelula(celula.x - h, celula.y + h, h),
      novaCelula(celula.x + h, celula.y + h, h)
    );
  }

  return { x: melhor.x, y: melhor.y };
}

/**
 * Onde o nome do município deve ficar.
 *
 * Usa o MAIOR polígono da feature: municípios com ilha (Angra, Paraty)
 * não podem ter o nome carimbado numa ilhota.
 *
 * A `largura` continua saindo do bounding box de tudo -- ela serve pra
 * escolher o tamanho da fonte, e aí o que importa é a extensão do
 * município na tela, não onde o texto vai.
 */
function posicaoDoRotulo(feature) {
  let maiorArea = -Infinity;
  let melhorAneis = null;

  for (const poligono of poligonosDaFeature(feature)) {
    const aneis = poligono.map((anel) => anel.map(projetar));
    const area = Math.abs(areaDoAnel(aneis[0]));
    if (area > maiorArea) {
      maiorArea = area;
      melhorAneis = aneis;
    }
  }

  const { largura } = centroDoBoundingBox(feature);
  const polo = poloDeInacessibilidade(melhorAneis);
  return {
    x: Number(polo.x.toFixed(CASAS_DECIMAIS)),
    y: Number(polo.y.toFixed(CASAS_DECIMAIS)),
    largura,
  };
}

/** Fórmula do laço (shoelace). O sinal não importa aqui, só o módulo. */
function areaDoAnel(anel) {
  let soma = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    soma += (anel[j][0] + anel[i][0]) * (anel[j][1] - anel[i][1]);
  }
  return soma / 2;
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
    const { x, y, largura } = posicaoDoRotulo(feature);
    // Fonte PROPORCIONAL ao tamanho do município: em áreas concentradas
    // (região metropolitana) os municípios são minúsculos, então a letra
    // fica bem pequena e não embola com a vizinha. Piso baixo (1.2) só pra
    // não sumir de vez -- quem quiser ler dá mais zoom (a letra cresce
    // junto com o mapa). Antes o piso era 3.5, gigante pros pequenos.
    const fonte = Math.max(1.2, Math.min(4, largura / 11));
    /* Vai em `--rotulo-base`, e NÃO em font-size, igual ao RJ: o CSS
       divide essa base pelo `--zoom` pra a letra ficar do mesmo tamanho
       NA TELA em qualquer aproximação. Como atributo font-size o nome
       era ampliado junto com o mapa e, no zoom fundo, "Abaeté" ocupava
       meia tela. O font-size continua escrito como reserva, pro caso do
       SVG ser aberto fora do app (o CSS ganha dele por especificidade). */
    return (
      `  <text class="rotulo-municipio" x="${x}" y="${y}" ` +
      `style="--rotulo-base:${fonte.toFixed(1)}" font-size="${fonte.toFixed(1)}" ` +
      `pointer-events="none">` +
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
