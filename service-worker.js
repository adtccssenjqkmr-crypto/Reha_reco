/**
 * service-worker.js
 * オフライン動作のためのキャッシュ制御
 */

const CACHE_NAME = "rehareco-cache-v28";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./evaluations.js",
  "./evaluations_extension.js",
  "./charts.js",
  "./manifest.json",
  "./icon.svg",
  "https://cdn.jsdelivr.net/npm/chart.js"
];

// インストール時に静的アセットをキャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Caching all static assets");
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// アクティベート時に古いキャッシュを削除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("[Service Worker] Deleting old cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// フェッチ要求時にキャッシュを優先的に返す（Cache First, Network Fallback）
self.addEventListener("fetch", (event) => {
  // 外部APIや別のスキーマのリクエストは除外
  if (!event.request.url.startsWith(self.location.origin) && !event.request.url.includes("cdn.jsdelivr.net")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        // レスポンスが正常な場合のみキャッシュに追加
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // オフライン時のフォールバック処理が必要な場合はここに記述
      });
    })
  );
});
