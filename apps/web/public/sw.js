// Service worker do Broomer Estoque.
//
// De propósito, NÃO guarda páginas nem dados em cache: estoque desatualizado
// na tela levaria a decisões erradas, e dados de uma empresa nunca devem
// ficar salvos no aparelho. Ele só mostra a página "sem conexão" quando a
// internet cai, em vez da tela de erro do navegador.
//
// Ao mudar este arquivo ou offline.html, troque a versão para atualizar o cache.
const CACHE = "broomer-estoque-offline-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Só a navegação entre páginas ganha o fallback; o resto vai direto à rede.
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(OFFLINE_URL)) ?? Response.error();
    }),
  );
});
