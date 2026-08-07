/**
 * Levanta quais selos já existem e quais faltam.
 *
 * Cada município precisa de TRÊS arquivos em assets/img/selos/:
 *   {id}.webp         colorido
 *   {id}fundo.webp    preto e branco (a capa da raspadinha)
 *   {id}dourado.webp  dourado
 *
 * Roda com: node tools/inventario-selos.js [--csv]
 * Com --csv, imprime pronto pra colar numa planilha.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const PASTA = path.join(RAIZ, "assets", "img", "selos");
const VARIANTES = [
  { sufixo: "", rotulo: "Colorido" },
  { sufixo: "fundo", rotulo: "Preto e branco" },
  { sufixo: "dourado", rotulo: "Dourado" },
];

const destinos = JSON.parse(fs.readFileSync(path.join(RAIZ, "data", "destinos.json"), "utf8"));
const existe = new Set(fs.readdirSync(PASTA));

const linhas = Object.entries(destinos).map(([id, dados]) => {
  const tem = VARIANTES.map((v) => existe.has(`${id}${v.sufixo}.webp`));
  return {
    id,
    nome: dados.nome,
    colorido: tem[0],
    fundo: tem[1],
    dourado: tem[2],
    completo: tem.every(Boolean),
    // O colorido é a origem: as outras duas saem dele. Sem ele, não há
    // por onde começar.
    faltaOrigem: !tem[0],
  };
});

if (process.argv.includes("--csv")) {
  console.log("Codigo IBGE;Municipio;Colorido;Preto e branco;Dourado;Status");
  for (const l of linhas) {
    const status = l.completo ? "Completo" : l.faltaOrigem ? "Nao iniciado" : "Faltam variantes";
    console.log(
      [l.id, l.nome, l.colorido ? "OK" : "", l.fundo ? "OK" : "", l.dourado ? "OK" : "", status].join(";")
    );
  }
} else {
  const completos = linhas.filter((l) => l.completo);
  const semNada = linhas.filter((l) => l.faltaOrigem);
  const parciais = linhas.filter((l) => !l.completo && !l.faltaOrigem);

  console.log(`Municipios no destinos.json: ${linhas.length}`);
  console.log(`  Completos (3 arquivos):   ${completos.length}`);
  console.log(`  So faltam variantes:      ${parciais.length}`);
  console.log(`  Sem nenhum selo:          ${semNada.length}`);

  if (parciais.length) {
    console.log("\nJa tem o colorido, faltam derivados (da pra gerar SEM IA):");
    for (const l of parciais) {
      const faltando = [!l.fundo && "fundo", !l.dourado && "dourado"].filter(Boolean);
      console.log(`  ${l.id} ${l.nome} -> falta ${faltando.join(" e ")}`);
    }
  }

  if (semNada.length) {
    console.log("\nSem nenhum selo (precisam do colorido gerado):");
    for (const l of semNada) console.log(`  ${l.id} ${l.nome}`);
  }
}
