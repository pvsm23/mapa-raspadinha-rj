/**
 * Service worker minimo: só o necessário para o navegador considerar
 * o site instalável como PWA (cache básico dos arquivos principais,
 * funciona offline para quem já visitou pelo menos uma vez).
 */
const CACHE_NAME = "mapa-raspadinha-v1";
const ARQUIVOS_BASICOS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/script.js",
  "./js/scratch-card.js",
  "./manifest.json",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_BASICOS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes
          .filter((nome) => nome !== CACHE_NAME)
          .map((nome) => caches.delete(nome))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  evento.respondWith(
    caches.match(evento.request).then((respostaCache) => {
      return (
        respostaCache ||
        fetch(evento.request).catch(() => caches.match("./index.html"))
      );
    })
  );
});
