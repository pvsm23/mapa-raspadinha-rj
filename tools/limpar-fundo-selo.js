/**
 * Tira o fundo branco de um selo gerado por IA, deixando os cantos
 * transparentes como nos selos que já existem no app.
 *
 * POR QUE PRECISA: o Gemini devolve o selo circular sobre um quadrado
 * branco opaco. Os selos do app têm canto transparente -- sem esta
 * limpeza, cada selo novo apareceria como um QUADRADO BRANCO atrás do
 * círculo, gritando no tema escuro.
 *
 * COMO: preenchimento por inundação a partir das bordas, removendo só
 * o branco CONECTADO à borda. Um recorte circular seria mais simples,
 * mas cortaria a arte se a IA gerasse o círculo um pouco maior ou
 * fora de centro -- e deixaria branco se gerasse menor. A inundação
 * não depende de a arte estar onde a gente espera, e preserva os
 * brancos de dentro do desenho (nuvens, paredes, espuma do mar).
 *
 *   node tools/limpar-fundo-selo.js entrada.png saida.webp
 */
const sharp = require("sharp");

// Quão longe da cor do canto um pixel ainda conta como fundo.
//
// Limiar ABSOLUTO não serve: o Gemini entrega o "fundo preto" como um
// degradê escuro azulado, não preto puro, e um corte fixo deixava
// respingos claros pela borda. Medindo a distância até a cor real dos
// cantos, o degradê inteiro é reconhecido -- e o contorno preto do
// desenho continua protegido, porque a inundação nunca chega nele.
const TOLERANCIA = 78;

async function limpar(entrada, saida, lado = 768) {
  const { data, info } = await sharp(entrada)
    .resize(lado, lado)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: L, height: A, channels: C } = info;

  // O fundo às vezes vem branco (prompt do colorido) e às vezes preto
  // (prompt do dourado pede "fundo preto"). Em vez de escolher à mão a
  // cada vez, decide pela média dos quatro cantos -- que são fundo em
  // qualquer selo circular.
  const cantos = [
    [2, 2],
    [L - 3, 2],
    [2, A - 3],
    [L - 3, A - 3],
  ].map(([x, y]) => {
    const i = (y * L + x) * C;
    return [data[i], data[i + 1], data[i + 2]];
  });

  // Cor de referência do fundo = média dos quatro cantos.
  const refFundo = [0, 1, 2].map(
    (c) => cantos.reduce((s, px) => s + px[c], 0) / cantos.length
  );
  const fundoClaro = (refFundo[0] + refFundo[1] + refFundo[2]) / 3 > 127;

  const ehFundo = (i) => {
    const dr = data[i] - refFundo[0];
    const dg = data[i + 1] - refFundo[1];
    const db = data[i + 2] - refFundo[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) <= TOLERANCIA;
  };

  const visitado = new Uint8Array(L * A);
  const fila = [];

  // Semeia a inundação em toda a moldura da imagem.
  for (let x = 0; x < L; x++) {
    fila.push([x, 0], [x, A - 1]);
  }
  for (let y = 0; y < A; y++) {
    fila.push([0, y], [L - 1, y]);
  }

  while (fila.length) {
    const [x, y] = fila.pop();
    if (x < 0 || y < 0 || x >= L || y >= A) continue;
    const p = y * L + x;
    if (visitado[p]) continue;
    const i = p * C;
    if (!ehFundo(i)) continue;

    visitado[p] = 1;
    data[i + 3] = 0; // some com o pixel
    fila.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  const apagados = visitado.reduce((s, v) => s + v, 0);

  await sharp(data, { raw: { width: L, height: A, channels: C } })
    .webp({ quality: 92 })
    .toFile(saida);

  return { apagados, total: L * A, fundo: fundoClaro ? "branco" : "preto" };
}

/**
 * Recorta o selo em CÍRCULO, jogando fora tudo que estiver fora dele.
 *
 * Serve para quando o Gemini desenha a cena "vazando" para além da
 * moldura -- acontece quando a gente insiste que ele copie a foto, e
 * ele acaba entregando a paisagem inteira com um aro por cima. A
 * inundação por cor não resolve esse caso, porque o que sobra fora do
 * círculo é desenho, não fundo liso.
 *
 * Assume o círculo centrado e encostando na menor dimensão -- que é
 * como o modelo compõe quando o pedido é um selo circular.
 */
async function recortarCirculo(entrada, saida, lado = 768) {
  const meta = await sharp(entrada).metadata();
  const menor = Math.min(meta.width, meta.height);

  const quadrado = await sharp(entrada)
    .extract({
      left: Math.round((meta.width - menor) / 2),
      top: Math.round((meta.height - menor) / 2),
      width: menor,
      height: menor,
    })
    .resize(lado, lado)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = quadrado;
  const centro = lado / 2;
  // 1px a menos evita deixar uma casquinha serrilhada na borda.
  const raio = centro - 1;

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const dx = x - centro;
      const dy = y - centro;
      if (dx * dx + dy * dy > raio * raio) {
        data[(y * lado + x) * info.channels + 3] = 0;
      }
    }
  }

  await sharp(data, { raw: { width: lado, height: lado, channels: info.channels } })
    .webp({ quality: 92 })
    .toFile(saida);
}

if (require.main === module) {
  if (process.argv.includes("--circulo")) {
    const [entrada, saida] = process.argv.slice(2).filter((a) => a !== "--circulo");
    recortarCirculo(entrada, saida).then(() => console.log(`${saida}: recortado em círculo`));
    return;
  }
  const [entrada, saida] = process.argv.slice(2);
  if (!entrada || !saida) {
    console.error("uso: node tools/limpar-fundo-selo.js <entrada> <saida.webp>");
    process.exit(1);
  }
  limpar(entrada, saida).then(({ apagados, total, fundo }) => {
    console.log(
      `${saida}: fundo ${fundo}, ${((apagados / total) * 100).toFixed(1)}% do quadro virou transparente`
    );
  });
}

module.exports = { limpar, recortarCirculo };
