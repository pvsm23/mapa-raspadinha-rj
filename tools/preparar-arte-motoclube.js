/**
 * Limpa as duas artes que entram no brasão do Motoclube (as asas e a
 * bandeira) e grava a versão pronta pra uso em assets/icons/.
 *
 *   node tools/preparar-arte-motoclube.js
 *
 * POR QUE PRECISA DE LIMPEZA: as duas chegaram como PRINT DE TELA de
 * um banco de imagens. O "fundo transparente" que aparece nelas é o
 * xadrez cinza DESENHADO no print -- os arquivos são 100% opacos.
 * Coladas assim no brasão, cada uma viraria um retângulo xadrez.
 *
 * POR QUE UM SCRIPT, E NÃO EDITAR À MÃO NUM EDITOR: o brasão é gerado
 * por código, e a arte de entrada precisa ser reproduzível junto. Os
 * prints originais ficam em tools/arte-origem/ e este script é a
 * receita que os transforma -- dá pra refazer tudo do zero, e trocar
 * um print por outro melhor não exige repetir cliques em editor
 * nenhum.
 *
 * POR QUE JÁ SAI PEQUENA: as duas são embutidas em base64 dentro dos
 * NOVENTA E DOIS brasões. Cada KB aqui vira ~123 KB no repositório e
 * no APK, então o tamanho de saída é escolhido pelo maior lugar em que
 * a arte aparece (o PNG de 1024px do compartilhamento), e nada além
 * disso.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const RAIZ = path.join(__dirname, "..");
const ORIGEM = path.join(__dirname, "arte-origem");
const DESTINO = path.join(RAIZ, "assets", "icons");

/**
 * ASAS -- recorte por LUMINÂNCIA.
 *
 * Dá pra ser simples aqui porque o desenho é branco puro e o xadrez do
 * print é cinza médio (tons 56 e 127): a distância entre os dois é
 * enorme. A rampa entre 150 e 240 apaga o xadrez e a sombra projetada,
 * mantém a asa opaca e ainda entrega meio-tom nas bordas, o que
 * preserva a serrilha suave em vez de deixar degrau.
 *
 * De quebra, o RGB é forçado pra branco: assim a asa combina com o
 * traço do brasão mesmo que o print tivesse um branco levemente
 * puxado pra outro tom.
 */
async function limparAsas(largura) {
  const { data, info } = await sharp(path.join(ORIGEM, "motoclube-asas.png"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    const luz = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const alfa = Math.max(0, Math.min(1, (luz - 150) / 90));
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = Math.round(alfa * 255);
  }

  return (
    sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .png()
      .trim()
      .resize({ width: largura })
      // Paleta de 8 cores: a asa é branco puro sobre transparente, então
      // o único degradê que existe é a suavização da borda, e oito
      // níveis dão conta dela. Corta o arquivo de 22 KB pra 4 KB -- e
      // isso vale 92 vezes, porque a asa é embutida em todos os
      // brasões. Sem `dither`, senão o quantizador espalha ruído em
      // cima de uma área que é chapada de propósito.
      .png({ compressionLevel: 9, palette: true, colours: 8, dither: 0 })
      .toBuffer()
  );
}

/**
 * BANDEIRA -- recorte por INUNDAÇÃO a partir das bordas.
 *
 * Aqui a luminância não serve: o mastro é branco e a faixa "ORDEM E
 * PROGRESSO" também, e as duas sumiriam junto com o xadrez. O que
 * distingue o fundo não é ser claro, é ser CINZA NEUTRO num dos dois
 * tons do xadrez (159 e 205) E estar ligado à borda da imagem.
 *
 * O mastro é branco 255 -- fora da faixa aceita -- então a inundação
 * passa por ele sem apagá-lo, que era o risco real deste recorte.
 */
async function limparBandeira(largura) {
  const { data, info } = await sharp(path.join(ORIGEM, "bandeira-brasil.png"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: L, height: A, channels: C } = info;
  const ehXadrez = (i) => {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Neutro: os três canais praticamente iguais.
    if (Math.max(r, g, b) - Math.min(r, g, b) > 14) return false;
    const v = (r + g + b) / 3;
    // Faixa CONTÍNUA entre os dois tons do xadrez (159 e 205), e não um
    // intervalo pra cada um: o print foi redimensionado antes de chegar
    // aqui, então entre um quadrado e o vizinho existe uma linha de
    // meio-tom (~182). Aceitando só os dois tons exatos, essa linha
    // vira parede e a inundação fica presa no primeiro quadrado --
    // era o que deixava metade do xadrez na imagem.
    return v > 138 && v < 226;
  };

  const visitado = new Uint8Array(L * A);
  const fila = [];
  const enfileirar = (x, y) => {
    if (x < 0 || y < 0 || x >= L || y >= A) return;
    const p = y * L + x;
    if (visitado[p]) return;
    if (!ehXadrez(p * C)) return;
    visitado[p] = 1;
    fila.push(p);
  };

  for (let x = 0; x < L; x++) {
    enfileirar(x, 0);
    enfileirar(x, A - 1);
  }
  for (let y = 0; y < A; y++) {
    enfileirar(0, y);
    enfileirar(L - 1, y);
  }

  while (fila.length) {
    const p = fila.pop();
    const x = p % L;
    const y = (p / L) | 0;
    data[p * C + 3] = 0;
    enfileirar(x + 1, y);
    enfileirar(x - 1, y);
    enfileirar(x, y + 1);
    enfileirar(x, y - 1);
  }

  return sharp(data, { raw: { width: L, height: A, channels: C } })
    .png()
    .trim()
    .resize({ width: largura })
    .png({ compressionLevel: 9, palette: true, colours: 64 })
    .toBuffer();
}

(async () => {
  fs.mkdirSync(DESTINO, { recursive: true });

  const trabalhos = [
    ["motoclube-asas.png", await limparAsas(560)],
    ["bandeira-brasil.png", await limparBandeira(190)],
  ];

  for (const [nome, buffer] of trabalhos) {
    fs.writeFileSync(path.join(DESTINO, nome), buffer);
    const meta = await sharp(buffer).metadata();
    console.log(`${nome}: ${meta.width}x${meta.height}, ${Math.round(buffer.length / 1024)} KB`);
  }
  console.log("Agora rode: node tools/gerar-logos-motoclube.js");
})();
