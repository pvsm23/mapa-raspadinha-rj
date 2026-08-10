/**
 * Converte data/rj-municipios.geojson (GeoJSON, WGS84) em um <svg> com
 * um <path> por municipio, mantendo o codigo IBGE como id/data-municipio
 * (mesma convencao usada no mapa de teste da Etapa 1). Cada path tambem
 * ganha data-regiao (ver data/regioes.json), usado para colorir por
 * regiao quando o mapa esta com zoom bem afastado.
 *
 * Projecao: equiretangular simples com correcao de cos(latitude media),
 * suficiente para uma area pequena como o estado do RJ.
 *
 * Uso: node tools/gerar-regioes.js (antes, se data/regioes.json mudar)
 *      node tools/geojson-to-svg.js
 * Gera: assets/svg/rj-municipios.svg
 */

const fs = require("fs");
const path = require("path");

const ENTRADA = path.join(__dirname, "..", "data", "rj-municipios.geojson");
const REGIOES = path.join(__dirname, "..", "data", "regioes.json");
const SAIDA = path.join(__dirname, "..", "assets", "svg", "rj-municipios.svg");

const LARGURA_SVG = 800;
const CASAS_DECIMAIS = 2;

const geojson = JSON.parse(fs.readFileSync(ENTRADA, "utf8"));

// Mapa codigo IBGE -> id da regiao (data/regioes.json), usado para
// colorir por regiao quando o mapa esta com zoom bem afastado.
const regioesJson = JSON.parse(fs.readFileSync(REGIOES, "utf8"));
const idParaRegiao = {};
for (const [regiaoId, dados] of Object.entries(regioesJson)) {
  dados.municipios.forEach((codigoIbge) => { idParaRegiao[codigoIbge] = regiaoId; });
}

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

/* ---- Onde colocar o nome do município ----
 *
 * O centro do bounding box ERRA em município côncavo ou em "L": o ponto
 * médio cai num pedaço que pertence ao vizinho. Resende é o caso
 * clássico -- o nome saía fora do próprio desenho.
 *
 * O certo é o "polo de inacessibilidade": o ponto INTERNO mais distante
 * de qualquer borda. Traduzindo pro problema real, é exatamente onde
 * sobra mais espaço livre pro texto -- que é o critério que a gente
 * quer, e não "o meio".
 *
 * Algoritmo do polylabel (Mapbox): divide em células, mede a distância
 * de cada centro até a borda e subdivide primeiro as mais promissoras.
 * Uma célula só é descartada quando nem no melhor caso poderia bater a
 * campeã atual.
 */
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
  return dx * dx + dy * dy; // ao quadrado: evita uma raiz por segmento
}

/** Positiva dentro, negativa fora -- assim "maior" já significa "bem dentro". */
function distanciaAteBorda(x, y, aneis) {
  let dentro = false;
  let menor = Infinity;

  for (const anel of aneis) {
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const a = anel[i];
      const b = anel[j];
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
        dentro = !dentro;
      }
      menor = Math.min(menor, distanciaAteSegmento(x, y, a, b));
    }
  }

  return (dentro ? 1 : -1) * Math.sqrt(menor);
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
 * Posição do rótulo: polo de inacessibilidade do MAIOR anel.
 *
 * O maior, e não o primeiro, porque município com ilha (Angra, Paraty,
 * Mangaratiba) não pode ter o nome carimbado numa ilhota.
 *
 * `largura` continua vindo do bounding box de tudo: ela escolhe o
 * tamanho da fonte, e aí o que importa é a extensão do município na
 * tela, não onde o texto vai cair.
 */
function posicaoDoRotulo(feature) {
  const aneis = feature.geometry.coordinates.map((anel) => anel.map(projetar));
  let maior = aneis[0];
  let maiorArea = -Infinity;
  for (const anel of aneis) {
    const area = Math.abs(areaDoAnel(anel));
    if (area > maiorArea) {
      maiorArea = area;
      maior = anel;
    }
  }

  const { largura } = centroDoBoundingBox(feature);
  const polo = poloDeInacessibilidade([maior]);
  return {
    x: Number(polo.x.toFixed(CASAS_DECIMAIS)),
    y: Number(polo.y.toFixed(CASAS_DECIMAIS)),
    largura,
  };
}

/** Fórmula do laço (shoelace). Só o módulo importa aqui. */
function areaDoAnel(anel) {
  let soma = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    soma += (anel[j][0] + anel[i][0]) * (anel[j][1] - anel[i][1]);
  }
  return soma / 2;
}

function centroDoBoundingBox(feature) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const anel of feature.geometry.coordinates) {
    for (const ponto of anel) {
      const [x, y] = projetar(ponto);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
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
    if (!regiaoId) throw new Error(`Municipio sem regiao: ${nome} (${codigoIbge})`);
    const d = feature.geometry.coordinates.map(anelParaPathD).join(" ");
    return (
      `  <path id="mun-${codigoIbge}" data-municipio="${codigoIbge}" ` +
      `data-nome="${escaparAtributo(nome)}" data-regiao="${regiaoId}" class="municipio" d="${d}" />`
    );
  })
  .join("\n");

/* ---- Rotulos, e a briga entre vizinhos ----
 *
 * pointer-events="none" faz o clique "atravessar" o texto e cair no
 * path por baixo. A fonte varia com a largura do municipio, pra nome
 * longo em municipio pequeno nao dominar o mapa.
 *
 * Posicionar cada nome DENTRO do proprio municipio (posicaoDoRotulo)
 * resolve so metade do problema: na Baixada e nos Lagos os municipios
 * sao pequenos e colados, entao dois nomes corretos ainda se encavalam.
 * Por isso vem a passada de anticolisao abaixo.
 */

// Largura media de um caractere em relacao ao corpo da fonte, na fonte
// que o app usa (system-ui, peso 600).
//
// Medido no navegador contra os 92 nomes reais: o pior caso deu 0.645.
// Comecei com 0.52 e foi pouco -- o gerador achava os nomes mais
// estreitos do que sao, dava a colisao por resolvida e ela continuava
// na tela. 0.66 fica acima do pior caso medido.
const FATOR_LARGURA_ROTULO = 0.66;

function caixaDoRotulo(r) {
  const largura = r.nome.length * FATOR_LARGURA_ROTULO * r.fonte;
  const altura = r.fonte;
  return { x: r.x - largura / 2, y: r.y - altura / 2, w: largura, h: altura };
}

function seCruzam(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/* ---- Em que zoom cada nome aparece ----
 *
 * O texto tem tamanho FIXO NA TELA (ver --zoom em css/styles.css): ao
 * aproximar, o municipio cresce e a letra nao. Isso muda tudo -- em
 * zoom maior sobra espaco de verdade, e nomes que nao cabiam passam a
 * caber.
 *
 * Entao, em vez de espremer todo mundo no mesmo zoom, cada nome ganha
 * o NIVEL em que ele passa a caber. Os grandes aparecem logo; os
 * pequenos so quando a tela abre espaco pra eles. E como mapa de
 * verdade funciona.
 */
const ZOOM_DOS_NIVEIS = [3.5, 5, 7, 10];

/** Caixa do rotulo como ela fica no SVG quando visto naquele zoom. */
function caixaNoZoom(r, zoom) {
  const fonte = r.fonte / (zoom / ZOOM_DOS_NIVEIS[0]);
  const largura = r.nome.length * FATOR_LARGURA_ROTULO * fonte;
  return { x: r.x - largura / 2, y: r.y - fonte / 2, w: largura, h: fonte };
}

/**
 * Atribui o nivel de cada nome, do municipio maior pro menor.
 *
 * Guloso e por area: quem tem mais territorio aparece antes. Um nome
 * so entra num nivel se, NAQUELE zoom, ele nao encostar em nenhum dos
 * que ja aparecem. Se nao couber em nivel nenhum, entra no ultimo
 * mesmo assim -- municipio minusculo pode ter o nome passando um pouco
 * por cima da divisa, desde que nao fique estranho, e nesse zoom a
 * sobra de tela ja e grande.
 */
function atribuirNiveis(rotulos) {
  const porArea = [...rotulos].sort((a, b) => b.area - a.area);
  const colocados = [];
  const contagem = [0, 0, 0, 0];

  for (const r of porArea) {
    let nivel = ZOOM_DOS_NIVEIS.length - 1;

    for (let n = 0; n < ZOOM_DOS_NIVEIS.length; n++) {
      const zoom = ZOOM_DOS_NIVEIS[n];
      const minha = caixaNoZoom(r, zoom);
      // Nesse zoom aparecem os deste nivel e os de todos os anteriores.
      const conflita = colocados
        .filter((o) => o.nivel <= n)
        .some((o) => seCruzam(minha, caixaNoZoom(o, zoom)));
      if (!conflita) {
        nivel = n;
        break;
      }
    }

    r.nivel = nivel;
    contagem[nivel]++;
    colocados.push(r);
  }

  return contagem;
}

/** O rotulo cabe nessa posicao sem sair do proprio municipio? */
function cabeDentro(r, x, y) {
  const meiaAltura = r.fonte / 2;
  const meiaLargura = (r.nome.length * FATOR_LARGURA_ROTULO * r.fonte) / 2;
  // Testa os dois extremos do texto, nao so o centro: um nome comprido
  // cabe no centro e escapa pelas pontas.
  return (
    distanciaAteBorda(x - meiaLargura, y, r.aneis) > meiaAltura &&
    distanciaAteBorda(x + meiaLargura, y, r.aneis) > meiaAltura &&
    distanciaAteBorda(x, y, r.aneis) > meiaAltura
  );
}

/**
 * Empurra pro lado os nomes que nascem em cima de um vizinho.
 *
 * Roda ANTES dos niveis: um nome afastado alguns pixels costuma passar
 * a caber num nivel mais baixo, ou seja, aparece mais cedo. Procura em
 * aneis concentricos, do mais perto pro mais longe, pra sair o minimo
 * possivel do ponto que o polo de inacessibilidade escolheu.
 *
 * Municipio minusculo pode ficar onde esta: nesses o nome passa por
 * cima da divisa de qualquer jeito, e isso e aceitavel.
 */
function afastarSobrepostos(rotulos) {
  const colideComAlguem = (r, x, y) => {
    const caixa = caixaDoRotulo({ ...r, x, y });
    return rotulos.some((o) => o !== r && seCruzam(caixa, caixaDoRotulo(o)));
  };

  let deslocados = 0;
  for (const r of rotulos) {
    if (!colideComAlguem(r, r.x, r.y)) continue;

    let achou = null;
    for (let raio = 1; raio <= 10 && !achou; raio++) {
      for (let ang = 0; ang < 16 && !achou; ang++) {
        const t = (ang / 16) * Math.PI * 2;
        const x = r.x + Math.cos(t) * raio * 1.5;
        const y = r.y + Math.sin(t) * raio * 1.5;
        if (cabeDentro(r, x, y) && !colideComAlguem(r, x, y)) achou = { x, y };
      }
    }

    if (achou) {
      r.x = Number(achou.x.toFixed(CASAS_DECIMAIS));
      r.y = Number(achou.y.toFixed(CASAS_DECIMAIS));
      deslocados++;
    }
  }
  return deslocados;
}

const dadosRotulos = featuresOrdenadas.map((feature) => {
  const { x, y, largura } = posicaoDoRotulo(feature);
  const aneis = feature.geometry.coordinates.map((anel) => anel.map(projetar));
  return {
    nome: feature.properties.name,
    x,
    y,
    fonte: Math.max(3.5, Math.min(6, largura / 8)),
    aneis,
    // Area do maior anel: decide quem cede numa colisao.
    area: Math.max(...aneis.map((anel) => Math.abs(areaDoAnel(anel)))),
  };
});

const deslocados = afastarSobrepostos(dadosRotulos);
const porNivel = atribuirNiveis(dadosRotulos);

/* O tamanho vai como VARIAVEL CSS, não como font-size.
 *
 * Quem calcula o font-size final é o CSS, dividindo essa base pelo
 * zoom atual (--zoom, escrito pelo app a cada movimento). Assim a letra
 * fica do mesmo tamanho na tela em qualquer aproximação, que é o que
 * faz os nomes pararem de brigar quando se aproxima. */
const rotulos = dadosRotulos
  .map(
    (r) =>
      `  <text class="rotulo-municipio" data-nivel="${r.nivel}" ` +
      `x="${r.x}" y="${r.y}" style="--rotulo-base:${r.fonte.toFixed(1)}" ` +
      `pointer-events="none">${escaparAtributo(r.nome)}</text>`
  )
  .join("\n");

const svg =
  `<svg id="mapa-rj" viewBox="0 0 ${LARGURA_SVG} ${alturaSvg.toFixed(CASAS_DECIMAIS)}" ` +
  `xmlns="http://www.w3.org/2000/svg">\n${paths}\n${rotulos}\n</svg>\n`;

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(SAIDA, svg, "utf8");

/* ---- E o index.html, que é quem o app realmente usa ----
 *
 * O mapa do RJ está EMBUTIDO no index.html, não é carregado do arquivo
 * acima. Enquanto isso dependia de alguém copiar e colar à mão, dava no
 * que deu: a correção dos nomes saiu numa versão publicada, o .svg
 * mudou, o app não -- e o bug continuou na tela do usuário.
 *
 * Agora um comando só atualiza os dois. Se o bloco não for encontrado,
 * o script FALHA em vez de avisar baixinho: gerar o arquivo e deixar o
 * app para trás é exatamente o erro que isto existe pra impedir.
 */
const INDEX = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(INDEX, "utf8");

const inicio = html.indexOf('<svg id="mapa-rj"');
const fim = inicio === -1 ? -1 : html.indexOf("</svg>", inicio);
if (inicio === -1 || fim === -1) {
  console.error("ERRO: não achei o bloco <svg id=\"mapa-rj\"> no index.html.");
  process.exit(1);
}

// Preserva a indentação do bloco original.
const recuo = html.slice(html.lastIndexOf("\n", inicio) + 1, inicio);
const svgIndentado = svg
  .trimEnd()
  .split("\n")
  .map((linha, i) => (i === 0 ? linha : recuo + linha))
  .join("\n");

fs.writeFileSync(INDEX, html.slice(0, inicio) + svgIndentado + html.slice(fim + "</svg>".length), "utf8");

console.log(`OK: ${geojson.features.length} municipios -> ${SAIDA}`);
console.log(`index.html atualizado (e o app usa ESTE, nao o .svg)`);
console.log(`viewBox: 0 0 ${LARGURA_SVG} ${alturaSvg.toFixed(CASAS_DECIMAIS)}`);
console.log(`rotulos deslocados: ${deslocados}`);
console.log(
  `nomes por nivel de zoom: ` +
    ZOOM_DOS_NIVEIS.map((z, i) => `${z}x -> ${porNivel[i]}`).join(", ")
);
console.log(`tamanho do arquivo: ${(svg.length / 1024).toFixed(1)} KB`);
