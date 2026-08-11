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
 *   node tools/gerar-logos-motoclube.js 3303807 --png   (gera um PNG
 *       ao lado, só pra olhar durante o desenvolvimento)
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

/* O brasão deixou de ser quadrado quando ganhou asas.
 *
 * O disco continua do MESMO tamanho de antes (raio 246): o que cresceu
 * foi a tela em volta, pra caber as asas nas laterais. Isso importa
 * porque o brasão também é usado como crachá minúsculo (18px do lado do
 * nome na Comunidade) -- amarrando a altura, o disco continua sendo
 * desenhado com os mesmos pixels de sempre e só o rastro horizontal
 * aumenta. Se em vez disso o disco tivesse encolhido pra caber num
 * quadrado, o crachá pequeno viraria uma bolinha ilegível. */
const LARGURA = 1170;
const ALTURA = 560;
const CX = LARGURA / 2;
const CY = ALTURA / 2;

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

/* Ano de fundação, partido ao meio: "20" às nove horas e "26" às três.
 * Fica nos dois pontos do anel que os arcos de texto não alcançam (o
 * "BORA VIVER!" para uns 45° antes da horizontal, e o nome também), e
 * é justamente o lugar onde brasão de clube costuma pôr ornamento. */
const ANO_ESQUERDA = "20";
const ANO_DIREITA = "26";
const CORPO_ANO = 38;

/* "MOTOCLUBE" vai DENTRO do miolo, logo acima da logo, com corpo menor
 * que o "DESBRAVA" -- a marca continua sendo a principal, e a palavra
 * só qualifica o grupo.
 *
 * A logo é um PNG de fundo preto, então ela cobriria o texto se viesse
 * depois. Por isso o "MOTOCLUBE" é desenhado DEPOIS da imagem no SVG:
 * ordem de pintura é a ordem do documento, e assim ele fica por cima
 * do preto, legível. */
const CORPO_MOTOCLUB = 22;

// Distância entre a base do "MOTOCLUBE" e o topo da palavra DESBRAVA.
const RESPIRO_MOTOCLUB = 8;

// Largura da palavra DESBRAVA dentro do miolo.
const LARGURA_LOGO = 232;

/* Asas: a arte traz as DUAS de uma vez, com o vão do meio já no lugar.
 * A largura é maior que o disco de propósito -- boa parte da asa fica
 * escondida atrás dele, e o que aparece é só a parte que se abre pros
 * lados. O deslocamento pra baixo alinha o encaixe da asa com o meio
 * do disco em vez de deixá-la flutuando acima dele. */
const LARGURA_ASAS = 944;
const DESCIDA_ASAS = 18;

/* Quanto cada asa é empurrada pra fora, a partir da posição em que a
 * arte original as deixa.
 *
 * A arte tem as duas asas num arquivo só, então aumentar a largura
 * afastaria uma da outra -- mas também deixaria as duas MAIORES e mais
 * altas, e não era isso o pedido. Em vez disso, a mesma imagem é
 * desenhada duas vezes, cada uma recortada na sua metade e deslocada.
 * O tamanho da asa não muda; só a distância até o disco. */
const AFASTAMENTO_ASAS = 76;

// Bandeira, embaixo do DESBRAVA e dentro do miolo.
const LARGURA_BANDEIRA = 96;

// Deslocamento vertical da palavra dentro do miolo. NÃO mexer: é o
// valor que o brasão já usava antes das asas, e a bandeira foi
// encaixada no espaço que sobrava abaixo dela em vez de empurrar a
// marca pra cima.
const DESCIDA_LOGO = 10;

/**
 * Arco pro texto de CIMA: da esquerda pra direita passando por cima.
 * Nesse sentido o texto nasce com a barriga pra dentro, que é como se
 * lê num brasão.
 */
function arcoSuperior(raio) {
  return `M ${CX - raio} ${CY} A ${raio} ${raio} 0 0 1 ${CX + raio} ${CY}`;
}

/**
 * Arco de BAIXO, percorrido da ESQUERDA pra DIREITA por baixo.
 *
 * O sentido é o detalhe que importa: percorrido no outro sentido, o
 * texto sai de cabeça pra baixo. Aqui as letras ficam em pé e o nome
 * se lê normalmente, acompanhando a curva do brasão.
 */
function arcoInferior(raio) {
  return `M ${CX - raio} ${CY} A ${raio} ${raio} 0 0 0 ${CX + raio} ${CY}`;
}

function escapar(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const n = (v) => Math.round(v * 10) / 10;

// Largura média de um caractere em relação ao corpo da fonte, na Arial
// bold em caixa alta. Estimativa -- o gerador não mede texto de
// verdade, então convém errar pra menos.
const FATOR_LARGURA = 0.66;

/**
 * Maior corpo de fonte em que `texto` ainda cabe no arco de baixo.
 *
 * O espaço não é o diâmetro: é o comprimento do arco disponível. Uso
 * 60% da meia-volta de baixo, pra o nome não subir demais pelas
 * laterais e brigar com o "BORA VIVER!" nem com o ano.
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
 * Lê um PNG já pronto e devolve base64 + medidas, pra embutir no SVG.
 *
 * As artes das asas e da bandeira são desenho, não geometria -- foram
 * escolhidas pelo Paulo e passam por tools/preparar-arte-motoclube.js,
 * que tira o fundo e reduz o tamanho. Aqui elas só entram no
 * documento.
 */
function embutir(caminho) {
  const buffer = fs.readFileSync(caminho);
  // Cabeçalho PNG: largura e altura são dois inteiros de 32 bits logo
  // depois do bloco IHDR, sempre nos bytes 16..23. Ler daqui evita
  // fazer o gerador esperar por mais uma chamada assíncrona do sharp
  // só pra saber a proporção.
  return {
    base64: buffer.toString("base64"),
    largura: buffer.readUInt32BE(16),
    altura: buffer.readUInt32BE(20),
  };
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

function montarSvg(id, nome, arte) {
  const logo = arte.logo;
  const rotulo = `${nome.toUpperCase()} - RJ`;
  const nomeAjuste = ajusteDoNome(rotulo);

  // Asas: a arte já vem com as duas, com o vão do meio no lugar certo.
  // Elas são pintadas ANTES do disco, e o disco cobre a raiz das duas
  // -- é isso que faz a asa "sair de trás" do brasão.
  const asasLargura = LARGURA_ASAS;
  const asasAltura = Math.round((asasLargura * arte.asas.altura) / arte.asas.largura);
  const asasY = CY - asasAltura / 2 + DESCIDA_ASAS;

  // Bandeira: encaixada no espaço que já sobrava embaixo do DESBRAVA.
  const bandeiraLargura = LARGURA_BANDEIRA;
  const bandeiraAltura = Math.round((bandeiraLargura * arte.bandeira.altura) / arte.bandeira.largura);

  // A palavra DESBRAVA fica no miolo, um pouco acima do centro; o
  // MOTOCLUBE encosta logo acima dela, a uma distância fixa do TOPO
  // REAL da palavra -- por isso a altura recortada importa.
  const alturaLogo = Math.round((LARGURA_LOGO * logo.altura) / logo.largura);
  const logoX = CX - LARGURA_LOGO / 2;
  const logoY = CY - alturaLogo / 2 + DESCIDA_LOGO;
  const yMotoclube = logoY - RESPIRO_MOTOCLUB;

  const bandeiraX = CX - bandeiraLargura / 2;
  const bandeiraY = logoY + alturaLogo + 12;

  // xlink:href, e não o href puro do SVG2: navegador aceita os dois,
  // mas renderizador baseado em librsvg (o do sharp, e vários
  // conversores pra PNG) só enxerga o textPath pelo xlink. Com href
  // sozinho o brasão sai sem NENHUM texto, e sem erro nenhum.
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${LARGURA} ${ALTURA}" width="${LARGURA}" height="${ALTURA}">
  <defs>
    <path id="arco-cima" d="${arcoSuperior(RAIO_TEXTO_CIMA)}" fill="none"/>
    <path id="arco-baixo" d="${arcoInferior(nomeAjuste.raio)}" fill="none"/>
    <clipPath id="meia-esquerda"><rect x="0" y="0" width="${CX}" height="${ALTURA}"/></clipPath>
    <!-- A arte das asas entra UMA vez e é reusada nas duas metades. Ela
         é o pedaço mais pesado do arquivo, e repetir o base64 engordava
         cada brasão em 6 KB: 550 KB somando os 92. -->
    <image id="asas-arte" xlink:href="data:image/png;base64,${arte.asas.base64}"
           x="${n(CX - asasLargura / 2 - AFASTAMENTO_ASAS)}" y="${n(asasY)}"
           width="${asasLargura}" height="${asasAltura}"/>
  </defs>

  <!-- Asas em duas metades, cada uma empurrada pro seu lado. A da
       direita é a MESMA imagem espelhada, o que garante simetria
       exata. Vêm antes do disco: ele cobre a raiz das duas, e é isso
       que faz a asa parecer sair de trás do brasão. -->
  <g clip-path="url(#meia-esquerda)"><use xlink:href="#asas-arte"/></g>
  <g transform="translate(${LARGURA} 0) scale(-1 1)">
    <g clip-path="url(#meia-esquerda)"><use xlink:href="#asas-arte"/></g>
  </g>

  <circle cx="${CX}" cy="${CY}" r="${RAIO_BORDA}" fill="${FUNDO}" stroke="${TRACO}" stroke-width="12"/>
  <circle cx="${CX}" cy="${CY}" r="${RAIO_MIOLO + 12}" fill="none" stroke="${TRACO}" stroke-width="7"/>

  <text x="${CX}" y="${yMotoclube}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="bold" fill="${TRACO}"
        font-size="${CORPO_MOTOCLUB}" letter-spacing="2">MOTOCLUBE</text>

  <image xlink:href="data:image/png;base64,${logo.base64}"
         x="${logoX}" y="${logoY}" width="${LARGURA_LOGO}" height="${alturaLogo}"/>

  <image xlink:href="data:image/png;base64,${arte.bandeira.base64}"
         x="${n(bandeiraX)}" y="${n(bandeiraY)}"
         width="${bandeiraLargura}" height="${bandeiraAltura}"/>

  <text font-family="Arial, Helvetica, sans-serif" font-weight="bold" fill="${TRACO}"
        font-size="${CORPO_CIMA}" letter-spacing="3">
    <textPath xlink:href="#arco-cima" startOffset="50%" text-anchor="middle">${escapar(FRASE_CIMA)}</textPath>
  </text>

  <text font-family="Arial, Helvetica, sans-serif" font-weight="bold" fill="${TRACO}"
        font-size="${nomeAjuste.corpo}" letter-spacing="1">
    <textPath xlink:href="#arco-baixo" startOffset="50%" text-anchor="middle">${escapar(rotulo)}</textPath>
  </text>

  <!-- 20 | 26: o ano de fundação partido nas duas laterais do anel. -->
  <g font-family="Arial, Helvetica, sans-serif" font-weight="bold" fill="${TRACO}"
     font-size="${CORPO_ANO}" text-anchor="middle">
    <text x="${CX - (FAIXA_DENTRO + FAIXA_FORA) / 2}" y="${CY + CORPO_ANO * 0.35}">${ANO_ESQUERDA}</text>
    <text x="${CX + (FAIXA_DENTRO + FAIXA_FORA) / 2}" y="${CY + CORPO_ANO * 0.35}">${ANO_DIREITA}</text>
  </g>
</svg>
`;
}

(async () => {
  if (!fs.existsSync(LOGO)) {
    console.error(`Logo não encontrada: ${path.relative(RAIZ, LOGO)}`);
    process.exit(1);
  }

  const asas = path.join(RAIZ, "assets", "icons", "motoclube-asas.png");
  const bandeira = path.join(RAIZ, "assets", "icons", "bandeira-brasil.png");
  for (const arquivo of [asas, bandeira]) {
    if (!fs.existsSync(arquivo)) {
      console.error(`Falta ${path.relative(RAIZ, arquivo)} -- rode antes: node tools/preparar-arte-motoclube.js`);
      process.exit(1);
    }
  }

  const arte = {
    logo: await prepararLogo(LOGO),
    asas: embutir(asas),
    bandeira: embutir(bandeira),
  };

  const destinos = JSON.parse(fs.readFileSync(path.join(RAIZ, "data", "destinos.json"), "utf8"));
  const pedidos = process.argv.filter((a) => /^\d{7}$/.test(a));
  const ids = pedidos.length ? pedidos : Object.keys(destinos);
  const querPng = process.argv.includes("--png");

  fs.mkdirSync(SAIDA, { recursive: true });

  let total = 0;
  for (const id of ids) {
    const nome = destinos[id]?.nome;
    if (!nome) {
      console.error(`  ${id}: município desconhecido`);
      continue;
    }
    const svg = montarSvg(id, nome, arte);
    fs.writeFileSync(path.join(SAIDA, `${id}.svg`), svg);
    if (querPng) {
      // Achatado sobre o fundo do app de propósito: o brasão é
      // transparente fora do disco, e conferir num PNG de fundo branco
      // esconde exatamente o que precisa ser conferido.
      await sharp(Buffer.from(svg))
        .resize({ width: 960 })
        .flatten({ background: "#12161B" })
        .png()
        .toFile(path.join(SAIDA, `${id}.png`));
    }
    total++;
  }

  const kb = Math.round(fs.statSync(path.join(SAIDA, `${ids[0]}.svg`)).size / 1024);
  console.log(`${total} brasão(ões) em ${path.relative(RAIZ, SAIDA)}/  (~${kb} KB cada)`);
})();
