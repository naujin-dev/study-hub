// 오프라인 모드: 사이트 파일을 이 기기에 저장해 두고, 인터넷이 없으면 저장본을 보여준다.
// 인터넷이 있으면 항상 새 파일을 먼저 받고 (받은 것으로 저장본도 새로 고친다), 없을 때만 저장본을 쓴다.
// VERSION 과 FILES 는 scripts/bump_version.py 가 쓴다.
const VERSION = '20261022084319';
const FILES = ["./", "index.html", "version.json", "favicon.svg", "css/style.css", "data/index.json", "data/exam.json", "js/ai.js", "js/app.js", "js/charts.js", "js/data.js", "js/hl.js", "js/prompts.js", "js/src.js", "js/store.js", "js/sync.js", "js/vendor/anthropic-sdk-0.131.0.js", "js/vendor/marked-12.0.2.min.js", "js/vendor/purify-3.1.6.min.js"];
const CACHE = 'study-hub';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 하나가 실패해도 나머지는 저장한다
    await Promise.all(FILES.map(f => fetch(f, { cache: 'no-cache' }).then(r => r.ok && c.put(f, r)).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin && url.pathname.startsWith(new URL('./', self.location).pathname);
  const font = FONT_HOSTS.includes(url.hostname);
  if (!same && !font) return; // Claude API, GitHub 등은 건드리지 않는다
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const isPage = req.mode === 'navigate';
    try {
      const res = await fetch(req, same && (isPage || url.pathname.endsWith('.json')) ? { cache: 'no-cache' } : undefined);
      if (res.ok || res.type === 'opaque') {
        // 주소 뒤의 ?v=, ?t= 는 빼고 저장한다
        const key = isPage ? 'index.html' : (same ? url.origin + url.pathname : req.url);
        c.put(key, res.clone()).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = isPage ? (await c.match('index.html')) || (await c.match('./'))
        : (await c.match(same ? url.origin + url.pathname : req, { ignoreSearch: same })) || (await c.match(req, { ignoreSearch: true }));
      if (hit) return hit;
      throw err;
    }
  })());
});
