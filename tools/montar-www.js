/**
 * Monta a pasta www/ que o Capacitor empacota dentro do APK.
 *
 * O site do Desbrava mora na RAIZ do repositório (porque é servido
 * assim pelo GitHub Pages), mas o Capacitor precisa de uma pasta só
 * com os arquivos web -- se apontasse pra raiz, ele levaria junto
 * node_modules/, android/, .git/ e as ferramentas. Então esta lista
 * é uma ALLOWLIST: só entra no app o que estiver aqui.
 *
 * Roda com:  npm run www     (ou, junto com o sync: npm run sync)
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DESTINO = path.join(RAIZ, "www");

const INCLUIR = [
  "index.html",
  "manifest.json",
  "sw.js",
  "guia.html",
  "privacidade.html",
  "css",
  "js",
  "assets",
  "data",
  "guia",
];

fs.rmSync(DESTINO, { recursive: true, force: true });
fs.mkdirSync(DESTINO, { recursive: true });

let copiados = 0;
for (const item of INCLUIR) {
  const origem = path.join(RAIZ, item);
  if (!fs.existsSync(origem)) {
    console.warn(`aviso: "${item}" não existe, pulando`);
    continue;
  }
  fs.cpSync(origem, path.join(DESTINO, item), { recursive: true });
  copiados++;
}

// Tamanho total, só pra acompanhar o peso do APK.
function tamanhoDe(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? tamanhoDe(p) : fs.statSync(p).size;
  }
  return total;
}

console.log(
  `www/ montada: ${copiados} itens, ${(tamanhoDe(DESTINO) / 1024 / 1024).toFixed(1)} MB`
);
