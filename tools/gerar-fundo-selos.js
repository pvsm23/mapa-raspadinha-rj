/**
 * Gera o `{id}fundo.webp` (preto e branco) a partir do `{id}.webp`.
 *
 * POR QUE POR SCRIPT, E NÃO PELA IA:
 * o `fundo` é a CAPA da raspadinha -- fica exatamente por cima do selo
 * colorido. Se ele for redesenhado por IA, a arte sai parecida mas não
 * idêntica, e o desenho revelado não bate com o que estava sendo
 * raspado. Derivando do próprio colorido, o alinhamento é garantido
 * por construção, sai em milissegundos e não custa nada.
 *
 * O `dourado` NÃO entra aqui: ele é uma medalha em relevo, um
 * re-render de verdade. Filtro nenhum produz aquilo.
 *
 *   node tools/gerar-fundo-selos.js            (só os que faltam)
 *   node tools/gerar-fundo-selos.js --forcar   (refaz todos)
 *   node tools/gerar-fundo-selos.js --saida <pasta>   (não sobrescreve)
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const RAIZ = path.join(__dirname, "..");
const PASTA = path.join(RAIZ, "assets", "img", "selos");

const forcar = process.argv.includes("--forcar");
const iSaida = process.argv.indexOf("--saida");
const destino = iSaida !== -1 ? path.resolve(process.argv[iSaida + 1]) : PASTA;
const somente = process.argv.filter((a) => /^\d{7}$/.test(a));

fs.mkdirSync(destino, { recursive: true });

async function gerar(id) {
  const origem = path.join(PASTA, `${id}.webp`);
  const alvo = path.join(destino, `${id}fundo.webp`);

  await sharp(origem)
    .grayscale()
    // O selo colorido tem fundo transparente e traço preto forte. A
    // dessaturação pura achata o contraste entre a moldura dourada e o
    // disco interno -- os dois viram cinzas parecidos. Um leve ganho de
    // contraste devolve a leitura das bordas sem estourar os brancos.
    .linear(1.3, -30)
    .webp({ quality: 90 })
    .toFile(alvo);

  return alvo;
}

(async () => {
  const arquivos = new Set(fs.readdirSync(PASTA));
  const ids = [...arquivos]
    .map((n) => n.match(/^(\d{7})\.webp$/))
    .filter(Boolean)
    .map((m) => m[1])
    .filter((id) => (somente.length ? somente.includes(id) : true))
    .filter((id) => forcar || somente.length || !arquivos.has(`${id}fundo.webp`));

  if (!ids.length) {
    console.log("Nada a fazer: todo selo colorido já tem seu fundo.");
    return;
  }

  for (const id of ids) {
    const alvo = await gerar(id);
    console.log(`  ${id} -> ${path.relative(RAIZ, alvo)}`);
  }
  console.log(`\n${ids.length} fundo(s) gerado(s).`);
})();
