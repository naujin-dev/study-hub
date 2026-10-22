// PDF 원본: 이 기기의 IndexedDB 에만 저장한다 (동기화·저장소에 올라가지 않는다).
// 보기는 pdf.js 로 페이지를 그림으로 그린다. 안드로이드 Chrome 은 페이지 안에서 PDF 를 바로 못 띄워서다.
const VENDOR = new URL('./vendor/', import.meta.url).href;
const LIB = VENDOR + 'pdfjs-4.10.38.min.js';

let dbp = null;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open('study-hub-pdf', 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore('pdf', { keyPath: 'id' });
      s.createIndex('pack', 'pack');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
function tx(mode, fn) {
  return idb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction('pdf', mode);
    const out = fn(t.objectStore('pdf'));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}

// 목록에는 파일 내용(blob)을 빼고 돌려준다
export async function listPdfs() {
  try {
    const all = await tx('readonly', s => s.getAll());
    return (all || []).map(({ blob, ...x }) => x).sort((a, b) => a.c - b.c);
  } catch (e) { return []; }
}
export function getPdf(id) { return tx('readonly', s => s.get(id)); }
export function deletePdf(id) { return tx('readwrite', s => s.delete(id)); }
export async function updatePdf(id, patch) {
  const cur = await getPdf(id);
  if (!cur) return;
  await tx('readwrite', s => s.put({ ...cur, ...patch }));
}
export async function addPdf(file, meta = {}) {
  const id = 'pdf-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const blob = file.slice(0, file.size, 'application/pdf');
  const name = meta.name || file.name || '';
  await tx('readwrite', s => s.put({ id, name, title: meta.title || (name || 'PDF').replace(/\.pdf$/i, ''), subject: meta.subject || null, pack: meta.pack || null, size: file.size, c: Date.now(), blob }));
  // 브라우저가 공간이 모자랄 때 지우지 않게 부탁한다
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  return id;
}

let lib = null;
async function pdfjs() {
  if (lib) return lib;
  lib = await import(LIB);
  lib.GlobalWorkerOptions.workerSrc = VENDOR + 'pdfjs-4.10.38.worker.min.js';
  return lib;
}

// box 안에 모든 페이지를 차례로 그린다. 화면에 가까워진 페이지만 실제로 그린다.
export async function renderPdf(box, blob, { zoom = 1, onPages } = {}) {
  const L = await pdfjs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await L.getDocument({ data, cMapUrl: VENDOR + 'pdfjs-cmaps/', cMapPacked: true, standardFontDataUrl: VENDOR + 'pdfjs-fonts/' }).promise;
  onPages && onPages(doc.numPages);
  box.innerHTML = '';
  const width = Math.max(280, box.clientWidth) * zoom;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const first = await doc.getPage(1);
  const base = first.getViewport({ scale: 1 });
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const wrap = document.createElement('div');
    wrap.className = 'pdf-page';
    wrap.dataset.n = i;
    wrap.style.width = width + 'px';
    wrap.style.aspectRatio = `${base.width} / ${base.height}`;
    box.appendChild(wrap);
    pages.push(wrap);
  }
  const draw = async wrap => {
    if (wrap.dataset.done) return;
    wrap.dataset.done = '1';
    const page = await doc.getPage(Number(wrap.dataset.n));
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: width / v1.width * dpr });
    wrap.style.aspectRatio = `${v1.width} / ${v1.height}`;
    const c = document.createElement('canvas');
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    wrap.appendChild(c);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  };
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) draw(e.target); }), { rootMargin: '800px 0px' });
  pages.forEach(p => io.observe(p));
  return { doc, pages, destroy: () => { io.disconnect(); doc.destroy(); } };
}
