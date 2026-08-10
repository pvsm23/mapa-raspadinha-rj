/**
 * Gera o ícone da barra de notificação: o "D" do Desbrava.
 *
 * REGRA DO ANDROID, que decide todo o desenho: o ícone de status é
 * tratado como MÁSCARA. O sistema joga fora as cores e pinta tudo de
 * branco, usando só o canal alfa -- e mostra num tamanho de 24dp.
 * Por isso aqui não há gradiente, contorno nem cor: é uma silhueta
 * chapada, com boa folga, que é o único tipo de desenho que sobrevive
 * a essa redução.
 *
 * O "D" é PATH, não texto: o renderizador do sharp neste ambiente não
 * tem fontes instaladas, então `<text>` sairia invisível -- e um ícone
 * vazio passaria despercebido até alguém instalar o app.
 *
 *   node tools/gerar-icone-notificacao.js
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const RAIZ = path.join(__dirname, "..");
const RES = path.join(RAIZ, "android", "app", "src", "main", "res");
const NOME = "ic_stat_desbrava.png";

// Buckets de densidade do Android para um ícone de 24dp.
const DENSIDADES = {
  "drawable-mdpi": 24,
  "drawable-hdpi": 36,
  "drawable-xhdpi": 48,
  "drawable-xxhdpi": 72,
  "drawable-xxxhdpi": 96,
};

/** Quadrado de pontas arredondadas, como caminho. */
function quadradoArredondado(x, y, lado, raio) {
  const x2 = x + lado;
  const y2 = y + lado;
  return [
    `M ${x + raio} ${y}`,
    `H ${x2 - raio}`,
    `A ${raio} ${raio} 0 0 1 ${x2} ${y + raio}`,
    `V ${y2 - raio}`,
    `A ${raio} ${raio} 0 0 1 ${x2 - raio} ${y2}`,
    `H ${x + raio}`,
    `A ${raio} ${raio} 0 0 1 ${x} ${y2 - raio}`,
    `V ${y + raio}`,
    `A ${raio} ${raio} 0 0 1 ${x + raio} ${y}`,
    "Z",
  ].join(" ");
}

/**
 * O ícone é um quadrado arredondado CHEIO com o "D" VAZADO nele --
 * estêncil, e não a letra sozinha.
 *
 * Tudo sai de um caminho único com fill-rule="evenodd", que alterna
 * preenchido/vazado a cada contorno aninhado:
 *   1. quadrado ......... preenchido
 *   2. contorno do D .... vira buraco (é o vazado da letra)
 *   3. barriga do D ..... volta a ser preenchido (a ilha de dentro)
 *
 * Precisa ser um caminho só: em elementos separados, o "buraco" seria
 * apenas um desenho branco por cima, e o Android -- que usa só o canal
 * alfa -- pintaria tudo de branco chapado, sumindo com o D.
 */
const CAMINHO_ICONE = [
  quadradoArredondado(4, 4, 92, 24),
  // Contorno do D (buraco)
  "M 32 22",
  "L 52 22",
  "C 70 22 80 34 80 50",
  "C 80 66 70 78 52 78",
  "L 32 78",
  "Z",
  // Barriga do D (ilha preenchida de novo)
  "M 46 36",
  "L 51 36",
  "C 60 36 64 42 64 50",
  "C 64 58 60 64 51 64",
  "L 46 64",
  "Z",
].join(" ");

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <path d="${CAMINHO_ICONE}" fill="#FFFFFF" fill-rule="evenodd"/>
</svg>`;

// Quanto do quadro a letra ocupa. O resto vira folga transparente.
// Sem isso o "D" encosta nas bordas e alguns aparelhos cortam.
const OCUPACAO = 0.76;

(async () => {
  const svg = Buffer.from(SVG);

  // Recorta a folga que o próprio viewBox tem, pra a letra ficar
  // centralizada de verdade: o "D" não é simétrico no quadro de 100.
  const letra = await sharp(svg, { density: 900 }).png().trim().toBuffer();

  let gerados = 0;
  for (const [pasta, lado] of Object.entries(DENSIDADES)) {
    const destino = path.join(RES, pasta);
    fs.mkdirSync(destino, { recursive: true });

    const interno = Math.round(lado * OCUPACAO);
    const sobra = lado - interno;
    const esquerda = Math.floor(sobra / 2);
    const topo = Math.floor(sobra / 2);

    await sharp(letra)
      .resize(interno, interno, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({
        top: topo,
        bottom: sobra - topo,
        left: esquerda,
        right: sobra - esquerda,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(path.join(destino, NOME));

    gerados++;
    console.log(`  ${pasta}/${NOME}  ${lado}x${lado}`);
  }

  console.log(`\n${gerados} densidades geradas.`);
})();
