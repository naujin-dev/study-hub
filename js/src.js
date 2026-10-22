// 자료의 본문(시·소설 원문, 영어 본문, 사료 등)과 교과서 사진.
// 본문 글: 자료 JSON 의 texts + 내가 사이트에서 붙여넣거나 고친 것(kv 'srctext', 동기화됨).
// 사진: 이 기기의 IndexedDB 에만 저장한다 (용량이 커서 Gist 동기화하지 않는다).
import * as S from './store.js';

const kkey = (packId, tid) => `${packId}::${tid}`;

// 보여줄 본문 목록: [{tid, title, body, mine, fromPack}]
export function textsOf(pack) {
  const out = [];
  const mine = S.kvAll('srctext');
  const seen = new Set();
  (pack.texts || []).forEach((t, i) => {
    const tid = String(t.id ?? 't' + (i + 1));
    seen.add(tid);
    const m = mine[kkey(pack.id, tid)];
    if (m && m.hidden) return;
    if (m) out.push({ tid, title: m.title || t.title || `본문 ${i + 1}`, body: m.body, mine: true, fromPack: true });
    else out.push({ tid, title: t.title || `본문 ${i + 1}`, body: t.body || '', mine: false, fromPack: true });
  });
  Object.values(mine)
    .filter(m => m.pack === pack.id && !seen.has(m.tid) && !m.hidden)
    .sort((a, b) => (a.c || 0) - (b.c || 0))
    .forEach(m => out.push({ tid: m.tid, title: m.title || '내 본문', body: m.body || '', mine: true, fromPack: false }));
  return out;
}

export function saveText(pack, tid, title, body) {
  const id = tid || 'my-' + Date.now().toString(36);
  const prev = S.kvGet('srctext', kkey(pack.id, id));
  S.kvSet('srctext', kkey(pack.id, id), { pack: pack.id, tid: id, title, body, c: prev?.c || Date.now() });
  return id;
}
// 내가 고친 것을 지우면 자료에 원래 있던 본문으로 돌아간다. 자료에 있던 본문을 지우면 숨긴다.
export function deleteText(pack, t) {
  const k = kkey(pack.id, t.tid);
  if (t.fromPack && !t.mine) S.kvSet('srctext', k, { pack: pack.id, tid: t.tid, hidden: true });
  else S.kvDel('srctext', k);
}
export function revertText(pack, t) {
  S.kvDel('srctext', kkey(pack.id, t.tid));
}

// AI 에 같이 보낼 본문 (길면 자른다)
export function textsForAI(pack, limit = 30000) {
  const all = textsOf(pack).map(t => `[본문: ${t.title}]\n${t.body}`).join('\n\n');
  return all.length > limit ? all.slice(0, limit) + '\n…(뒤는 생략)' : all;
}

// ---------- 사진 (IndexedDB) ----------
let dbp = null;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open('study-hub', 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore('img', { keyPath: 'id' });
      s.createIndex('pack', 'pack');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
function tx(mode, fn) {
  return idb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction('img', mode);
    const out = fn(t.objectStore('img'));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}
export async function listImages(packId) {
  try {
    const all = await tx('readonly', s => s.index('pack').getAll(packId));
    return (all || []).sort((a, b) => a.c - b.c);
  } catch (e) { return []; }
}
export function deleteImage(id) { return tx('readwrite', s => s.delete(id)); }

// 사진을 긴 변 1600px, JPEG 로 줄여서 저장한다
export async function addImage(packId, file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
  const id = 'img-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  await tx('readwrite', s => s.put({ id, pack: packId, blob, name: file.name || '', c: Date.now() }));
  return id;
}
