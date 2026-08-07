/**
 * Servidor estático mínimo pra abrir o app da RAIZ do repo, sem build.
 *
 * Existe porque o app é servido da raiz em produção (GitHub Pages), e
 * abrir index.html por file:// quebra fetch, service worker e módulos.
 * Só pra desenvolvimento -- nada aqui vai pro www/.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const PORTA = 8123;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    const semQuery = decodeURIComponent(req.url.split("?")[0]);
    const relativo = semQuery === "/" ? "index.html" : semQuery.slice(1);

    // Impede subir pra fora da raiz com "../".
    const alvo = path.join(RAIZ, relativo);
    if (!alvo.startsWith(RAIZ)) {
      res.writeHead(403).end("Fora da raiz");
      return;
    }

    fs.readFile(alvo, (erro, conteudo) => {
      if (erro) {
        res.writeHead(404).end("Não encontrado: " + relativo);
        return;
      }
      res.writeHead(200, {
        "Content-Type": TIPOS[path.extname(alvo).toLowerCase()] || "application/octet-stream",
        // Permite que uma página de outro domínio (ex.: o Gemini) leia
        // um arquivo daqui. É servidor de desenvolvimento, só escuta em
        // localhost e só serve o que já está no repositório público.
        "Access-Control-Allow-Origin": "*",
      });
      res.end(conteudo);
    });
  })
  .listen(PORTA, () => console.log("Desbrava em http://localhost:" + PORTA));
