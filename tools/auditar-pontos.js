/**
 * Confere a saúde de cada ponto turístico de data/destinos.json e
 * separa em faixas de confiança.
 *
 *   node tools/auditar-pontos.js            (resumo)
 *   node tools/auditar-pontos.js --lista    (com todos os pontos)
 *
 * POR QUE EXISTE: os pontos foram gerados por IA, e IA inventa lugar.
 * A prova apareceu em Tanguá -- havia um "Lagoa de Tanguá" que não
 * existe com esse nome; o que existe é a Lagoa Azul, e o marcador
 * estava plantado num BAIRRO chamado Lagoa Verde, a quilômetros dali.
 * Passou por todas as validações porque bairro e lagoa ficam os dois
 * dentro do município.
 *
 * Três sinais são cruzados aqui:
 *
 *  1. ACHOU NO MAPA?  Ponto sem coordenada é ponto que o OpenStreetMap
 *     não conhece, mesmo procurado de quatro formas diferentes.
 *  2. TEM HISTÓRIA?   Ponto sem texto é ponto sobre o qual não se
 *     achou informação confiável nenhuma.
 *  3. O NOME BATE?    Quando a busca acha algo, `_geo` guarda o nome
 *     que o OpenStreetMap devolveu. Se ele não tem relação com o nome
 *     do ponto, a coordenada pode estar num lugar homônimo ou parecido
 *     -- foi exatamente o caso de Tanguá.
 *
 * O sinal 3 é o mais valioso e o menos óbvio: ele questiona justamente
 * os pontos que PARECEM resolvidos.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const d = JSON.parse(fs.readFileSync(path.join(RAIZ, "data", "destinos.json"), "utf8"));

const semAcento = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Palavras que não distinguem nada: aparecem em metade dos nomes e em
// quase todo endereço, então casá-las não prova parentesco.
const VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "no", "na",
  "rio", "janeiro", "regiao", "sudeste", "brasil", "praca", "rua", "avenida",
  "estrada", "municipio", "distrito", "centro", "nossa", "senhora", "santo",
  "santa", "sao", "igreja", "matriz", "parque", "praia", "lagoa", "cachoeira",
  "museu", "casa", "antiga", "antigo", "historico", "historica", "municipal",
  "estacao", "ferroviaria", "fazenda", "fazendas", "mirante", "ilha", "ponte",
]);

/** Quantas palavras fortes do nome aparecem no endereço devolvido. */
function palavrasEmComum(nomePonto, geo) {
  const doNome = semAcento(nomePonto)
    .replace(/[()\-,.]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 3 && !VAZIAS.has(p));
  if (!doNome.length) return { total: 0, casaram: 0, palavras: [] };
  const alvo = semAcento(geo);
  const casaram = doNome.filter((p) => alvo.includes(p));
  return { total: doNome.length, casaram: casaram.length, palavras: doNome };
}

const faixas = {
  conferido: [],      // achou no mapa E o nome bate E tem história
  nomeSuspeito: [],   // achou no mapa, mas o endereço não parece o lugar
  semNomeForte: [],   // achou no mapa, mas o nome é genérico demais pra checar
  soHistoria: [],     // não achou no mapa, mas há informação sobre o lugar
  semNada: [],        // não achou no mapa e não há informação: suspeito de invenção
};

for (const [id, municipio] of Object.entries(d)) {
  for (const ponto of municipio.destinos || []) {
    const registro = {
      id,
      cidade: municipio.nome,
      ponto: ponto.nome,
      geo: ponto._geo || null,
      temHistoria: !!ponto.textoCompleto,
    };

    if (typeof ponto.lat !== "number") {
      (ponto.textoCompleto ? faixas.soHistoria : faixas.semNada).push(registro);
      continue;
    }

    // Coordenada colada à mão não tem endereço de origem pra comparar.
    // `_geoFixo` é o mesmo caso por outro caminho: alguém já abriu, viu
    // e decidiu. Acusar de novo só treina a gente a ignorar o aviso.
    if (ponto._geoFixo || !ponto._geo || ponto._geo === "colado à mão") {
      faixas.conferido.push(registro);
      continue;
    }

    const { total, casaram } = palavrasEmComum(ponto.nome, ponto._geo);
    if (total === 0) faixas.semNomeForte.push(registro);
    else if (casaram === 0) faixas.nomeSuspeito.push(registro);
    else faixas.conferido.push(registro);
  }
}

const totalPontos = Object.values(d).reduce((s, m) => s + (m.destinos || []).length, 0);
const linha = (t, arr, nota) =>
  console.log(`  ${String(arr.length).padStart(3)}  ${t.padEnd(30)} ${nota}`);

console.log(`AUDITORIA DOS PONTOS TURISTICOS  --  ${totalPontos} pontos, 92 municipios\n`);
linha("CONFERIDO", faixas.conferido, "achou no mapa e o nome do lugar bate");
linha("NOME SUSPEITO", faixas.nomeSuspeito, "achou no mapa, mas o endereco nao parece o lugar");
linha("NOME GENERICO", faixas.semNomeForte, "achou no mapa, mas o nome nao da pra conferir");
linha("SO HISTORIA", faixas.soHistoria, "nao achou no mapa, mas existe informacao");
linha("SEM NADA", faixas.semNada, "nao achou no mapa nem informacao -- suspeito");

console.log(`\n${"=".repeat(64)}`);
console.log("NOME SUSPEITO -- conferir um a um (o caso da Lagoa de Tangua):");
console.log("=".repeat(64));
for (const r of faixas.nomeSuspeito) {
  console.log(`  ${r.cidade} / ${r.ponto}`);
  console.log(`     o mapa devolveu: ${r.geo}`);
}

if (process.argv.includes("--lista")) {
  console.log(`\n${"=".repeat(64)}`);
  console.log("SEM NADA -- nao achou no mapa nem informacao:");
  console.log("=".repeat(64));
  let cidadeAtual = "";
  for (const r of faixas.semNada) {
    if (r.cidade !== cidadeAtual) {
      cidadeAtual = r.cidade;
      console.log(`\n  ${cidadeAtual} (${r.id})`);
    }
    console.log(`     - ${r.ponto}`);
  }
}

// Municipios inteiros na faixa "sem nada" -- se todos os 5 pontos de
// uma cidade caem aqui, o problema pode ser a lista inteira.
console.log(`\n${"=".repeat(64)}`);
console.log("MUNICIPIOS COM 4 OU 5 PONTOS NA FAIXA 'SEM NADA':");
console.log("=".repeat(64));
const porCidade = {};
for (const r of faixas.semNada) porCidade[r.cidade] = (porCidade[r.cidade] || 0) + 1;
Object.entries(porCidade)
  .filter(([, n]) => n >= 4)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cidade, n]) => console.log(`  ${n}/5  ${cidade}`));
