/**
 * Gera data/sp-regioes.json a partir das 15 MESORREGIÕES do IBGE, que
 * já vêm no cadastro de municípios da API v1
 * (data/sp-municipios-nomes.json, campo mesorregiao.nome).
 *
 * Estrutura de saída (mesma ideia do RJ, + campo "cor"):
 *   {
 *     "<slug>": { "nome": "<Nome da mesorregião>", "cor": <0-14>,
 *                 "municipios": ["3500105", ...] }
 *   }
 *
 * O "cor" é um índice estável (mesorregiões ordenadas por nome) que o
 * CSS usa pra pintar cada região de uma cor distinta no "modo regiões"
 * (mapa afastado) -- ver svg#mapa-sp.modo-regioes em css/styles.css.
 *
 * Uso: node tools/gerar-regioes-sp.js
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const NOMES = path.join(RAIZ, "data", "sp-municipios-nomes.json");
const SAIDA = path.join(RAIZ, "data", "sp-regioes.json");

function slug(texto) {
  return String(texto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const municipios = JSON.parse(fs.readFileSync(NOMES, "utf8"));

// Agrupa códigos IBGE por nome de mesorregião.
const porMeso = {};
for (const m of municipios) {
  const nome = m.microrregiao.mesorregiao.nome;
  (porMeso[nome] = porMeso[nome] || []).push(String(m.id));
}

// Ordena as mesorregiões por nome (determinístico) e atribui cor 0..N-1.
const nomesOrdenados = Object.keys(porMeso).sort((a, b) => a.localeCompare(b, "pt-BR"));

const saida = {};
nomesOrdenados.forEach((nome, indice) => {
  saida[slug(nome)] = {
    nome,
    cor: indice,
    municipios: porMeso[nome].sort(),
  };
});

fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 2) + "\n", "utf8");

console.log(`Mesorregiões: ${nomesOrdenados.length}`);
let total = 0;
nomesOrdenados.forEach((nome, i) => {
  const n = porMeso[nome].length;
  total += n;
  console.log(`  ${String(i).padStart(2)} ${slug(nome).padEnd(34)} ${String(n).padStart(3)} municípios  (${nome})`);
});
console.log(`Total de municípios: ${total} (esperado 645)`);
