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
const CACHE_NAME = "mapa-raspadinha-v6";
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

// Notificações locais (ver dispararNotificacaoLocal em js/script.js):
// ao tocar na notificação, foca uma aba já aberta do app ou abre uma
// nova, em vez de só fechar a notificação sem fazer nada.
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientes) => {
      const existente = clientes.find((cliente) => "focus" in cliente);
      if (existente) return existente.focus();
      return self.clients.openWindow("./");
    })
  );
});

self.addEventListener("fetch", (evento) => {
  /* Só cuida do que é NOSSO (mesma origem) e só de GET.
     Sem esta guarda, o SW interceptava TAMBÉM as fotos dos posts
     (drive.google.com), o Firestore e as APIs do Google -- e as fotos
     simplesmente não apareciam no app, embora a URL respondesse 200
     e o arquivo fosse público. Motivo: a resposta de uma imagem de
     outro domínio é "opaca" (sem CORS); o cache.put() abaixo rejeita
     com TypeError nesse tipo de resposta, e qualquer tropeço aqui
     dentro vira uma imagem quebrada, porque o respondWith já tirou o
     pedido das mãos do navegador.
     Não chamar respondWith deixa o navegador tratar do jeito
     normal dele, que é exatamente o que essas requisições precisam. */
  const url = new URL(evento.request.url);
  if (evento.request.method !== "GET" || url.origin !== self.location.origin) return;

  evento.respondWith(
    // cache: "no-store" evita que o proprio navegador sirva uma
    // resposta HTTP antiga aqui dentro do service worker (o SW so
    // deveria confiar no CACHE DELE, nao no cache HTTP do browser).
    fetch(evento.request, { cache: "no-store" })
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() =>
        caches.match(evento.request).then((r) => {
          if (r) return r;
          // So cai pro index.html se for navegacao de pagina de
          // verdade (ex: abrir o app offline). Pra pedidos de DADOS
          // (json, imagens etc.) sem cache ainda, e melhor deixar
          // falhar de verdade -- sem isso, um data/curiosidades.json
          // que falhasse na rede e ainda nao tivesse cache virava,
          // silenciosamente, o HTML da pagina inteira disfarcado de
          // resposta "ok" pro fetch() que esperava JSON, um jeito
          // sorrateiro de corromper dado sem erro nenhum aparecer.
          if (evento.request.mode === "navigate" || evento.request.destination === "document") {
            return caches.match("./index.html");
          }
          throw new Error("Sem rede e sem cache pra " + evento.request.url);
        })
      )
  );
});
