/* Service Worker：把页面外壳和 WASM 全部预缓存，装成 app 后完全离线可用。
 *
 * CACHE_NAME 由 make build-wasm 按各资源的字节内容重算（见 Makefile）。内容一变
 * 缓存名就变，新 Service Worker 安装时删掉旧缓存并重新缓存；不改名的话用户会一直
 * 用着旧页面，光刷新普通 HTTP 缓存是刷不掉的。
 *
 * 预缓存列表和实际文件名必须一致，由 make test-wasm-web 检查。
 */
const CACHE_NAME = 'pretty-shell_placeholder';

const PRECACHE = [
  './',
  './index.html',
  './app.js',
  './i18n.js',
  './wasm_exec.js',
  './pretty.wasm',
  './manifest.webmanifest',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // 单个资源失败不该让整次安装失败，用 reload 绕开 HTTP 缓存。
      .then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(names => Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求一律回退到缓存里的 index.html：断网时任何路径都要能打开页面。
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(cached => cached || fetch(request)),
    );
    return;
  }

  // 其余资源缓存优先。构建产物文件名固定，靠 CACHE_NAME 换代，不依赖运行期更新。
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});