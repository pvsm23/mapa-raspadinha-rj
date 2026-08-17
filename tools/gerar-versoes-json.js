/**
 * Extrai o HISTORICO_VERSOES de js/script.js e grava data/versoes.json.
 *
 *   node tools/gerar-versoes-json.js
 *
 * POR QUE ISSO PRECISA EXISTIR: o changelog mora dentro do próprio
 * script.js, que vai EMPACOTADO no APK. Ou seja, um app instalado só
 * conhece as novidades até a versão dele -- justamente as versões
 * NOVAS, que a gente quer anunciar, são as que ele não tem como saber.
 *
 * A saída é publicada junto com o site. O app desatualizado busca esse
 * arquivo na web e aí sim consegue listar o que mudou desde a versão
 * instalada. Se a busca falhar (offline), o aviso ainda aparece, só
 * sem a lista -- ver avisarAtualizacaoDisponivel em js/script.js.
 *
 * A fonte da verdade continua sendo o HISTORICO_VERSOES: este script
 * só COPIA de lá, pra não existirem dois changelogs pra desencontrar.
 * Rode depois de mexer no histórico (o montar-www.js já chama).
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const ORIGEM = path.join(RAIZ, "js", "script.js");
const DESTINO = path.join(RAIZ, "data", "versoes.json");

const fonte = fs.readFileSync(ORIGEM, "utf8");

/* Pega do "const HISTORICO_VERSOES = [" até o "];" que fecha, na
 * primeira coluna. Depender da indentação é frágil em geral, mas aqui
 * o array é de nível superior e o fechamento está sempre na coluna 0 --
 * e é o que evita ter que embutir um parser de JS aqui dentro. */
const trecho = fonte.match(/const HISTORICO_VERSOES = (\[[\s\S]*?\n\]);/);
if (!trecho) {
  console.error("Não achei o HISTORICO_VERSOES em js/script.js.");
  process.exit(1);
}

let historico;
try {
  // O array é literal e sem chamada de função: avaliar é seguro aqui e
  // aceita as aspas/escapes do JS que o JSON.parse recusaria.
  historico = eval(trecho[1]);
} catch (erro) {
  console.error("O HISTORICO_VERSOES não pôde ser lido:", erro.message);
  process.exit(1);
}

if (!Array.isArray(historico) || !historico.length) {
  console.error("HISTORICO_VERSOES veio vazio.");
  process.exit(1);
}

const problemas = [];
for (const v of historico) {
  if (!v.versao) problemas.push("entrada sem `versao`");
  if (!Array.isArray(v.itens) || !v.itens.length) {
    problemas.push(`${v.versao}: sem itens`);
  }
}
if (problemas.length) {
  console.error("Histórico com problema:\n  " + problemas.join("\n  "));
  process.exit(1);
}

const versaoApp = (fonte.match(/const VERSAO_APP = "([^"]+)"/) || [])[1];
if (versaoApp && historico[0].versao !== versaoApp) {
  console.error(
    `VERSAO_APP é ${versaoApp} mas o topo do histórico é ${historico[0].versao}.\n` +
      "Toda entrega precisa de um item novo no HISTORICO_VERSOES -- é ele\n" +
      "que o aviso de atualização mostra pra quem está desatualizado."
  );
  process.exit(1);
}

fs.writeFileSync(DESTINO, JSON.stringify(historico, null, 2) + "\n");
console.log(
  `data/versoes.json: ${historico.length} versões, a mais recente ${historico[0].versao}`
);
