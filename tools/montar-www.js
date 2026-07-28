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
  // Só fazem sentido no site (o Netlify publica esta mesma pasta),
  // mas não atrapalham dentro do APK.
  "ads.txt",
  "robots.txt",
  "sitemap.xml",
];

/* ---- Manifesto do pacote offline (PRO) ----
   Lista o que baixarDadosOffline() em js/script.js manda pro cache.
   É GERADO, não escrito à mão: a alternativa seria o app chutar 276
   URLs de selo (92 municípios x 3 variações) e comer ~160 respostas
   404, e qualquer arte nova ficaria de fora até alguém lembrar de
   editar a lista.

   Gerado na RAIZ (e não em www/) de propósito: o site é servido da
   raiz pelo GitHub Pages/Netlify, então o manifesto precisa existir
   lá também -- a cópia abaixo o leva pro www/ de brinde. */
function listarArquivos(dirAbsoluto, prefixoUrl) {
  if (!fs.existsSync(dirAbsoluto)) return [];
  const saida = [];
  for (const e of fs.readdirSync(dirAbsoluto, { withFileTypes: true })) {
    const url = `${prefixoUrl}/${e.name}`;
    if (e.isDirectory()) saida.push(...listarArquivos(path.join(dirAbsoluto, e.name), url));
    else if (!e.name.startsWith(".") && e.name !== "offline-manifest.json") saida.push(url);
  }
  return saida;
}

const arquivosOffline = [
  ...listarArquivos(path.join(RAIZ, "assets/img/selos"), "assets/img/selos"),
  ...listarArquivos(path.join(RAIZ, "assets/svg"), "assets/svg"),
  ...listarArquivos(path.join(RAIZ, "data"), "data").filter((u) => u.endsWith(".json")),
];

// Sem timestamp de propósito: com ele, o arquivo apareceria como
// modificado no git a cada build, mesmo sem arte nova nenhuma.
fs.writeFileSync(
  path.join(RAIZ, "data", "offline-manifest.json"),
  JSON.stringify({ arquivos: arquivosOffline }, null, 0) + "\n"
);
console.log(`manifesto offline: ${arquivosOffline.length} arquivos`);

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
