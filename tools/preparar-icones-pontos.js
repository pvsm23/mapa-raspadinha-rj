/**
 * Tira o fundo escuro das artes de ponto turístico e grava o PNG
 * transparente que vai pro mapa.
 *
 *   node tools/preparar-icones-pontos.js <entrada.png> <saida.png>
 *
 * POR QUE PRECISA: as artes vêm geradas por IA sobre um fundo escuro
 * chapado (~#0A0D13), não transparente. No mapa, esse fundo viraria um
 * quadrado escuro por cima do município.
 *
 * POR QUE NÃO É SÓ "TIRAR O QUE É ESCURO": o desenho é flat/cartoon com
 * CONTORNO PRETO, e o preto do contorno (0,0,0) é mais escuro que o
 * fundo (10,13,18) por pouco. Um corte por brilho apagaria o contorno
 * junto e desmancharia o desenho.
 *
 * O que funciona é INUNDAÇÃO a partir das bordas: só sai o escuro que
 * está LIGADO à moldura da imagem. O contorno do desenho nunca é
 * alcançado, porque a inundação para nele -- ele é escuro demais pra
 * entrar na tolerância. E preto de dentro do desenho (sombra, janela)
 * fica intocado por não ter caminho até a borda.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

/* Distância máxima (euclidiana no RGB) até a cor do canto pra um pixel
 * ainda contar como fundo.
 *
 * Medido nestas artes: o fundo varia de (9,12,17) a (13,15,21), no
 * máximo ~5 de distância entre si; o contorno preto está a ~27. Doze
 * cabe o fundo inteiro com folga e ainda para longe do contorno. */
const TOLERANCIA = 12;

async function limpar(entrada, saida, lado = 320) {
  const { data, info } = await sharp(entrada).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: L, height: A, channels: C } = info;

  // A cor de referência é a MÉDIA dos quatro cantos: um canto sozinho
  // pode calhar de estar num pixel de ruído do gerador de imagem.
  const cantos = [
    [0, 0],
    [L - 1, 0],
    [0, A - 1],
    [L - 1, A - 1],
  ].map(([x, y]) => {
    const i = (y * L + x) * C;
    return [data[i], data[i + 1], data[i + 2]];
  });
  const fundo = [0, 1, 2].map((k) => cantos.reduce((s, c) => s + c[k], 0) / cantos.length);

  const ehFundo = (i) =>
    Math.hypot(data[i] - fundo[0], data[i + 1] - fundo[1], data[i + 2] - fundo[2]) <= TOLERANCIA;

  const visitado = new Uint8Array(L * A);
  const fila = [];
  const enfileirar = (x, y) => {
    if (x < 0 || y < 0 || x >= L || y >= A) return;
    const p = y * L + x;
    if (visitado[p] || !ehFundo(p * C)) return;
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

  let removidos = 0;
  while (fila.length) {
    const p = fila.pop();
    data[p * C + 3] = 0;
    removidos++;
    const x = p % L;
    const y = (p / L) | 0;
    enfileirar(x + 1, y);
    enfileirar(x - 1, y);
    enfileirar(x, y + 1);
    enfileirar(x, y - 1);
  }

  /* Segunda passada: fundo ILHADO, que a inundação não alcança.
   *
   * No Pão de Açúcar, os cabos do bondinho cruzam o céu de ponta a
   * ponta e fecham um pedaço de fundo entre os dois morros. A
   * inundação para nos cabos e aquele naco ficava opaco -- um triângulo
   * preto no meio da arte.
   *
   * Aqui a cor decide sozinha, sem depender de caminho até a borda. É
   * seguro PORQUE o fundo é um tom bem específico (~#0A0D13) e o preto
   * do desenho é 0,0,0, a uns 26 de distância: o dobro da tolerância.
   * O contador abaixo existe pra conferir -- se um dia esse número
   * disparar numa arte nova, é sinal de que ela usa o tom do fundo como
   * cor de desenho, e aí esta passada tem que sair. */
  let ilhados = 0;
  for (let i = 0; i < data.length; i += C) {
    if (data[i + 3] !== 0 && ehFundo(i)) {
      data[i + 3] = 0;
      ilhados++;
    }
  }

  const buffer = await sharp(data, { raw: { width: L, height: A, channels: C } })
    .png()
    .trim()
    // Reduzir DEPOIS de recortar é o que suaviza a borda: o corte é
    // duro (dentro/fora), e a média da redução transforma o degrau em
    // meio-tom, sem precisar de desfoque.
    .resize({ width: lado, height: lado, fit: "inside" })
    .png({ compressionLevel: 9 })
    .toBuffer();

  fs.writeFileSync(saida, buffer);
  const meta = await sharp(buffer).metadata();
  const pct = (((removidos + ilhados) / (L * A)) * 100).toFixed(0);
  const nota = ilhados ? `, ${ilhados} px de fundo ilhado` : "";
  console.log(
    `${path.basename(saida)}: ${meta.width}x${meta.height}, ${Math.round(buffer.length / 1024)} KB (${pct}% do quadro era fundo${nota})`
  );
}

const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) {
  console.error("uso: node tools/preparar-icones-pontos.js <entrada.png> <saida.png>");
  process.exit(1);
}
limpar(entrada, saida);
