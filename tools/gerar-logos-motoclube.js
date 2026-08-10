/**
 * Gera o brasão de cada grupo do Motoclube -- um por município.
 *
 * POR QUE POR SCRIPT, E NÃO POR IA:
 * o brasão é desenho geométrico, não ilustração. Círculo, logo no meio
 * e texto curvo em volta. Por script, os 92 saem idênticos entre si, o
 * texto está sempre certo e sempre legível, em segundos e de graça.
 * Gerados por IA, sairiam 92 variações com o nome do município escrito
 * errado em boa parte deles.
 *
 * A logo do Desbrava entra embutida em base64, pra cada SVG funcionar
 * sozinho -- inclusive fora do app (Instagram, adesivo, o que for).
 *
 *   node tools/gerar-logos-motoclube.js            (todos os 92)
 *   node tools/gerar-logos-motoclube.js 3303807    (só um, pra conferir)
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const RAIZ = path.join(__dirname, "..");
// A logo oficial é a palavra DESBRAVA em branco sobre preto. O ícone
// colorido com o mapa do Brasil, que está solto na raiz do projeto, é
// de uma versão antiga -- não usar.
const LOGO = path.join(RAIZ, "assets", "icons", "desbrava-icone.png");
const SAIDA = path.join(RAIZ, "assets", "img", "motoclube-grupos");

const LADO = 512;
const CENTRO = LADO / 2;

// Raios, de fora pra dentro. O anel entre BORDA e MIOLO é onde o texto
// curvo corre; o miolo é o disco que recebe a logo.
const RAIO_BORDA = 246;
const RAIO_MIOLO = 150;

// Faixa livre entre o aro de fora e o anel de dentro. É nela que os
// dois textos correm, e é ela que define os raios abaixo.
const FAIXA_DENTRO = RAIO_MIOLO + 14;
const FAIXA_FORA = RAIO_BORDA - 6;

/* Raio da LINHA DE BASE de cada texto.
 *
 * Não é o meio da faixa: as letras não crescem em volta da linha de
 * base, elas crescem só pra um lado. No arco de cima, a letra sobe pra
 * FORA; no de baixo, ela sobe pra DENTRO. Por isso os dois raios são
 * calculados em sentidos opostos -- foi o que fez as palavras
 * encostarem na borda quando os dois usavam o mesmo raio. */
const CORPO_CIMA = 40;
const CORPO_BAIXO_MAX = 34;
const RAIO_TEXTO_CIMA = FAIXA_DENTRO + (FAIXA_FORA - FAIXA_DENTRO - CORPO_CIMA) / 2;

const TRACO = "#FFFFFF";
const FUNDO = "#0F1216";

const FRASE_CIMA = "BORA VIVER!";

/* "Motoclub" vai DENTRO do miolo, logo acima da logo, com corpo menor
 * que o "DESBRAVA" -- a marca continua sendo a principal, e a palavra
 * só qualifica o grupo.
 *
 * A logo é um PNG de fundo preto, então ela cobriria o texto se viesse
 * depois. Por isso o "Motoclub" é desenhado DEPOIS da imagem no SVG:
 * ordem de pintura é a ordem do documento, e assim ele fica por cima
 * do preto, legível. */
const CORPO_MOTOCLUB = 22;

// Distância entre a base do "MOTOCLUB" e o topo da palavra DESBRAVA.
const RESPIRO_MOTOCLUB = 8;

// Largura da palavra DESBRAVA dentro do miolo.
const LARGURA_LOGO = 232;

/**
 * Arco pro texto de CIMA: da esquerda pra direita passando por cima.
 * Nesse sentido o texto nasce com a barriga pra dentro, que é como se
 * lê num brasão.
 */
function arcoSuperior(raio) {
  return `M ${CENTRO - raio} ${CENTRO} A ${raio} ${raio} 0 0 1 ${CENTRO + raio} ${CENTRO}`;
}

/**
 * Arco de BAIXO, percorrido da ESQUERDA pra DIREITA por baixo.
 *
 * O sentido é o detalhe que importa: percorrido no outro sentido, o
 * texto sai de cabeça pra baixo. Aqui as letras ficam em pé e o nome
 * se lê normalmente, acompanhando a curva do brasão.
 */
function arcoInferior(raio) {
  return `M ${CENTRO - raio} ${CENTRO} A ${raio} ${raio} 0 0 0 ${CENTRO + raio} ${CENTRO}`;
}

function escapar(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Largura média de um caractere em relação ao corpo da fonte, na Arial
// bold em caixa alta. Estimativa -- o gerador não mede texto de
// verdade, então convém errar pra menos.
const FATOR_LARGURA = 0.66;

/**
 * Maior corpo de fonte em que `texto` ainda cabe no arco de baixo.
 *
 * O espaço não é o diâmetro: é o comprimento do arco disponível. Uso
 * 60% da meia-volta de baixo, pra o nome não subir demais pelas
 * laterais e brigar com o "BORA VIVER!".
 */
function corpoQueCabeNoArco(texto, raio) {
  const arcoUtil = Math.PI * raio * 0.6;
  return Math.floor(arcoUtil / (texto.length * FATOR_LARGURA));
}

/**
 * Corpo e raio do nome do município.
 *
 * O nome corre numa linha só, curvada. Nomes longos ganham corpo menor
 * -- e, como a letra do arco de baixo cresce pra DENTRO, o raio da
 * linha de base sobe junto pra manter o texto no meio da faixa em vez
 * de encostar no aro de fora.
 */
function ajusteDoNome(rotulo) {
  let corpo = Math.min(CORPO_BAIXO_MAX, corpoQueCabeNoArco(rotulo, FAIXA_FORA - 20));
  corpo = Math.max(14, corpo);
  const raio = FAIXA_FORA - (FAIXA_FORA - FAIXA_DENTRO - corpo) / 2;
  return { corpo, raio };
}

/**
 * Deixa a logo como palavra branca sobre TRANSPARENTE.
 *
 * O PNG original é branco sobre preto puro (#000000), e o brasão tem
 * fundo #0F1216. Coladas, as duas cores formavam um quadrado visível
 * dentro do círculo -- "um preto diferente do outro". Igualar as cores
 * resolveria só enquanto ninguém mexesse no fundo; tirar o preto
 * resolve pra sempre.
 *
 * A conversão usa a LUMINÂNCIA como transparência: onde era branco fica
 * opaco, onde era preto some, e a borda serrilhada das letras vira
 * meio-tom em vez de degrau. Depois `trim` corta a moldura vazia, o que
 * dá as medidas reais da palavra pra posicionar tudo em cima delas.
 */
async function prepararLogo(caminho) {
  const { data, info } = await sharp(caminho).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    const luz = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = luz;
  }

  const recortada = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png()
    .trim()
    .toBuffer({ resolveWithObject: true });

  return {
    base64: recortada.data.toString("base64"),
    largura: recortada.info.width,
    altura: recortada.info.height,
  };
}

function montarSvg(nome, logo) {
  const rotulo = `${nome.toUpperCase()} - RJ`;
  const nomeAjuste = ajusteDoNome(rotulo);

  // A palavra DESBRAVA fica centrada no miolo; o MOTOCLUBE encosta logo
  // acima dela, a uma distância fixa do TOPO REAL da palavra -- por
  // isso a altura recortada importa.
  const alturaLogo = Math.round((LARGURA_LOGO * logo.altura) / logo.largura);
  const logoX = CENTRO - LARGURA_LOGO / 2;
  const logoY = CENTRO - alturaLogo / 2 + 10;
  const yMotoclube = logoY - RESPIRO_MOTOCLUB;

  // xlink:href, e não o href puro do SVG2: navegador aceita os dois,
  // mas renderizador baseado em librsvg (o do sharp, e vários
  // conversores pra PNG) só enxerga o textPath pelo xlink. Com href
  // sozinho o brasão sai sem NENHUM texto, e sem erro nenhum.
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${LADO} ${LADO}" width="${LADO}" height="${LADO}">
  <defs>
    <path id="arco-cima" d="${arcoSuperior(RAIO_TEXTO_CIMA)}" fill="none"/>
    <path id="arco-baixo" d="${arcoInferior(nomeAjuste.raio)}" fill="none"/>
    <clipPath id="recorte-miolo">
      <circle cx="${CENTRO}" cy="${CENTRO}" r="${RAIO_MIOLO}"/>
    </clipPath>
  </defs>

  <circle cx="${CENTRO}" cy="${CENTRO}" r="${RAIO_BORDA}" fill="${FUNDO}" stroke="${TRACO}" stroke-width="12"/>
  <circle cx="${CENTRO}" cy="${CENTRO}" r="${RAIO_MIOLO + 12}" fill="none" stroke="${TRACO}" stroke-width="7"/>

  <text x="${CENTRO}" y="${yMotoclube}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="bold" fill="${TRACO}"
        font-size="${CORPO_MOTOCLUB}" letter-spacing="2">MOTOCLUBE</text>

  <image xlink:href="data:image/png;base64,${logo.base64}"
         x="${logoX}" y="${logoY}" width="${LARGURA_LOGO}" height="${alturaLogo}"/>

  <text font-family="Arial, Helvetica, sans-serif" font-weight="bold" fill="${TRACO}"
        font-size="${CORPO_CIMA}" letter-spacing="3">
    <textPath xlink:href="#arco-cima" startOffset="50%" text-anchor="middle">${escapar(FRASE_CIMA)}</textPath>
  </text>

  <text font-family="Arial, Helvetica, sans-serif" font-weight="bold" fill="${TRACO}"
        font-size="${nomeAjuste.corpo}" letter-spacing="1">
    <textPath xlink:href="#arco-baixo" startOffset="50%" text-anchor="middle">${escapar(rotulo)}</textPath>
  </text>
</svg>
`;
}

(async () => {
  if (!fs.existsSync(LOGO)) {
    console.error(`Logo não encontrada: ${path.relative(RAIZ, LOGO)}`);
    process.exit(1);
  }

  const logo = await prepararLogo(LOGO);

  const destinos = JSON.parse(fs.readFileSync(path.join(RAIZ, "data", "destinos.json"), "utf8"));
  const pedidos = process.argv.filter((a) => /^\d{7}$/.test(a));
  const ids = pedidos.length ? pedidos : Object.keys(destinos);

  fs.mkdirSync(SAIDA, { recursive: true });

  let total = 0;
  for (const id of ids) {
    const nome = destinos[id]?.nome;
    if (!nome) {
      console.error(`  ${id}: município desconhecido`);
      continue;
    }
    fs.writeFileSync(path.join(SAIDA, `${id}.svg`), montarSvg(nome, logo));
    total++;
  }

  const kb = Math.round(fs.statSync(path.join(SAIDA, `${ids[0]}.svg`)).size / 1024);
  console.log(`${total} brasão(ões) em ${path.relative(RAIZ, SAIDA)}/  (~${kb} KB cada)`);
})();
