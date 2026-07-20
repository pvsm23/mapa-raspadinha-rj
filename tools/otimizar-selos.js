/**
 * Converte a arte dos selos de PNG para WebP.
 *
 * Motivo: os selos eram PNG 1024x1024 de 1 a 2,5 MB cada -- 92 MB no
 * total. Como o app pré-carrega todos os selos em segundo plano (ver
 * preCarregarSelos em js/script.js), isso torrava os dados do celular
 * de quem usa o site, e inviabilizava embutir tudo no APK. O maior
 * tamanho em que um selo aparece na tela é 650px, então 768px sobra.
 *
 * Roda com:  node tools/otimizar-selos.js
 * Os PNGs originais continuam no histórico do git.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const LADO = 768;
const QUALIDADE = 88;
const PASTAS = ["selos", "regioes", "rotas", "conquistas"];

(async () => {
  let antes = 0;
  let depois = 0;
  let convertidos = 0;

  for (const pasta of PASTAS) {
    const dir = path.join(__dirname, "..", "assets", "img", pasta);
    if (!fs.existsSync(dir)) continue;

    for (const arquivo of fs.readdirSync(dir)) {
      if (!arquivo.toLowerCase().endsWith(".png")) continue;

      const origem = path.join(dir, arquivo);
      const destino = origem.replace(/\.png$/i, ".webp");
      const tamanhoAntes = fs.statSync(origem).size;

      await sharp(origem)
        // "inside" só reduz se for maior; nunca amplia arte menor.
        .resize(LADO, LADO, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: QUALIDADE })
        .toFile(destino);

      const tamanhoDepois = fs.statSync(destino).size;
      antes += tamanhoAntes;
      depois += tamanhoDepois;
      convertidos++;
      fs.unlinkSync(origem);
    }
  }

  const mb = (b) => (b / 1024 / 1024).toFixed(1);
  console.log(
    `${convertidos} imagens convertidas: ${mb(antes)} MB -> ${mb(depois)} MB ` +
      `(-${Math.round((1 - depois / antes) * 100)}%)`
  );
})();
