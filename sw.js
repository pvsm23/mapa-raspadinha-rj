/**
 * Service worker minimo: só o necessário para o navegador considerar
 * o site instalável como PWA, funcionando offline para quem já
 * visitou pelo menos uma vez.
 *
 * Estratégia "network-first": sempre tenta buscar a versão mais nova
 * na rede primeiro, e só cai no cache se estiver offline. Com
 * "cache-first" o app ficaria preso numa versão antiga do
 * HTML/CSS/JS para sempre, mesmo depois de um deploy novo — só
 * atualizaria se o CACHE_NAME mudasse a cada vez, o que é fácil de
 * esquecer de fazer.
 */
const CACHE_NAME = "mapa-raspadinha-v3";
const ARQUIVOS_BASICOS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/script.js",
  "./js/scratch-card.js",
  "./js/auth.js",
  "./js/firebase-config.js",
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
    fetch(evento.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() => caches.match(evento.request).then((r) => r || caches.match("./index.html")))
  );
});
