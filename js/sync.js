// GitHub 비공개 Gist 로 공부 기록을 여러 기기에서 맞춘다.
// 토큰은 이 기기에만 저장하고 Gist 에 올리지 않는다. API 키도 올리지 않는다.
//
// Gist 파일
//   study-hub-kv-<종류>.json      : kv 를 종류별로 (계획, 회고, 형광펜·메모, 읽음, 시험 정보 …)
//   study-hub-kv-packs-<과목>.json : 큰 것(가져온 자료·원문·책 문제)은 과목별로 한 번 더 나눈다
//   study-hub-state.json          : 예전 한 덩어리 파일. 받아서 합친 뒤 지운다
//   study-hub-events-YYYY-MM.json : 그 달의 events
// 동기화 = 받아서 합치기 → 합친 결과 올리기. 지우는 일은 없으므로 두 기기가 동시에 써도 기록이 사라지지 않는다.
import * as S from './store.js';

const API = 'https://api.github.com';
const DESC = 'study-hub 공부 기록 (자동 동기화, 지우지 마세요)';
const STATE_FILE = 'study-hub-state.json';

let status = { state: 'off', msg: '', at: null };
const subs = [];
export function onStatus(fn) { subs.push(fn); fn(status); }
function setStatus(state, msg = '') {
  status = { state, msg, at: state === 'ok' ? Date.now() : status.at };
  if (state === 'ok') S.save('syncAt', status.at);
  subs.forEach(f => { try { f(status); } catch (e) {} });
}
export function getStatus() { return status; }

export function conf() {
  return { token: '', gistId: '', auto: true, ...S.load('sync', {}) };
}
function setConf(c) { S.save('sync', { ...conf(), ...c }); }
export function isOn() { const c = conf(); return !!(c.token && c.gistId); }

async function gh(path, opts = {}) {
  const c = conf();
  const r = await fetch(API + path, {
    ...opts,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${opts.token || c.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.etag ? { 'If-None-Match': opts.etag } : {}),
    },
  });
  // 바뀐 게 없으면 GitHub 이 304 만 돌려준다 (내용을 안 받고, 요청 한도에도 안 센다)
  if (r.status === 304) return { notModified: true };
  if (!r.ok) {
    let m = '';
    try { m = (await r.json()).message || ''; } catch (e) {}
    const err = new Error(explain(r.status, m));
    err.status = r.status;
    throw err;
  }
  if (r.status === 204) return null;
  const j = await r.json();
  if (opts.wantEtag && j && typeof j === 'object') j.__etag = r.headers.get('ETag') || '';
  return j;
}
function explain(st, m) {
  if (st === 401) return 'GitHub 토큰이 맞지 않거나 만료됐다. 설정에서 새 토큰을 넣어 줘.';
  if (st === 403 || st === 404) return 'Gist 에 접근할 권한이 없다. 토큰의 Gists 권한(읽기·쓰기)을 확인해 줘. ' + m;
  if (st === 422) return 'Gist 가 너무 커서 올리지 못했다. ' + m;
  return `GitHub 오류 ${st} ${m}`;
}

// ---------- 연결 ----------
export async function connect(token) {
  token = token.trim();
  const user = await gh('/user', { token });
  // 이미 만든 Gist 가 있으면 그걸 쓴다
  let gistId = '';
  for (let page = 1; page <= 5 && !gistId; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`, { token });
    const hit = list.find(g => g.description === DESC || (g.files && Object.keys(g.files).some(n => n.startsWith('study-hub-'))));
    if (hit) gistId = hit.id;
    if (list.length < 100) break;
  }
  if (!gistId) {
    const g = await gh('/gists', { token, method: 'POST', body: JSON.stringify({ description: DESC, public: false, files: { [STATE_FILE]: { content: '{"app":"study-hub","v":2,"kv":{}}' } } }) });
    gistId = g.id;
  }
  setConf({ token, gistId, login: user.login, auto: true });
  S.save('syncHashes', {});
  S.save('syncEtag', '');
  S.save('syncRaw', {});
  S.save('syncRemote', []);
  await syncNow();
  return { login: user.login, gistId };
}
export function disconnect() {
  const c = conf();
  S.save('sync', { gistId: c.gistId, login: c.login, auto: c.auto });
  setStatus('off');
}

// ---------- 동기화 ----------
let running = null;
let again = false;
export function syncNow() {
  if (!isOn()) return Promise.resolve(false);
  if (running) { again = true; return running; }
  running = (async () => {
    setStatus('busy', '동기화 중');
    try {
      const changed = await pullMerge();
      await push();
      setStatus('ok');
      return changed;
    } catch (err) {
      setStatus('error', err.message || String(err));
      return false;
    } finally {
      running = null;
      if (again) { again = false; setTimeout(syncNow, 500); }
    }
  })();
  return running;
}

async function fileText(f) {
  if (!f.truncated && typeof f.content === 'string') return f.content;
  const r = await fetch(f.raw_url, { cache: 'no-store' });
  if (!r.ok) throw new Error('Gist 파일을 받지 못했다.');
  return r.text();
}

// kv 를 작은 파일로 나눈다: 종류마다 하나, 큰 것(자료·원문·책 문제)은 과목마다 하나.
// 계획 하나를 체크해도 5MB 를 통째로 올리고 받던 것을, 바뀐 조각만 오가게 한다.
// 방금 받은 파일 내용의 해시. 합친 뒤 내 것이 그대로면 다시 올리지 않는다
let pulled = {};
const HEAVY = new Set(['packs', 'srctext', 'bookq']);
const safe = t => String(t).toLowerCase().replace(/[^a-z0-9]/g, '') || 'x';
function kvFiles(kv) {
  const out = {};
  for (const col in kv) {
    for (const id in kv[col]) {
      const name = `study-hub-kv-${safe(col)}${HEAVY.has(col) ? '-' + safe(String(id).split('-')[0]) : ''}.json`;
      const f = out[name] || (out[name] = {});
      (f[col] || (f[col] = {}))[id] = kv[col][id];
    }
  }
  return out;
}

async function pullMerge() {
  let g;
  const et = S.load('syncEtag', '');
  try {
    g = await gh('/gists/' + conf().gistId, { etag: et, wantEtag: true });
  } catch (err) {
    // 혹시 브라우저가 If-None-Match 요청을 막으면(네트워크 오류) 예전 방식으로 한 번 더
    if (err.status || !et) throw err;
    S.save('syncEtag', '');
    g = await gh('/gists/' + conf().gistId);
  }
  if (g.notModified) return false;
  // 지난번에 받은 것과 주소(raw_url, 내용이 바뀌면 달라진다)가 같은 파일은 다시 받지 않는다
  const seen = S.load('syncRaw', {});
  const now = {};
  const names = Object.keys(g.files).filter(n => n.startsWith('study-hub-'));
  const todo = names.filter(n => { now[n] = g.files[n].raw_url || ''; return !now[n] || seen[n] !== now[n]; });
  const texts = await Promise.all(todo.map(n => fileText(g.files[n])));
  const incoming = { events: [], kv: {} };
  todo.forEach((name, k) => {
    let data;
    try { data = JSON.parse(texts[k]); } catch (e) { delete now[name]; return; }
    pulled[name] = hash(texts[k]);
    if (Array.isArray(data.events)) incoming.events.push(...data.events);
    // 예전 한 덩어리 파일(study-hub-state.json)과 새 조각 파일 모두 kv 를 담고 있다
    for (const col in data.kv || {}) Object.assign(incoming.kv[col] || (incoming.kv[col] = {}), data.kv[col]);
  });
  const changed = S.mergeIn(incoming);
  S.save('syncRaw', now);
  S.save('syncRemote', names);
  S.save('syncEtag', g.__etag || '');
  if (changed) window.dispatchEvent(new CustomEvent('sh-synced'));
  return changed;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ':' + s.length;
}

async function push() {
  const snap = S.snapshot();
  const files = {};
  const parts = kvFiles(snap.kv);
  for (const name in parts) files[name] = JSON.stringify({ app: 'study-hub', v: 2, kv: parts[name] });
  const byMonth = {};
  for (const e of snap.events) {
    const d = new Date(e.t);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    (byMonth[m] || (byMonth[m] = [])).push(e);
  }
  for (const m in byMonth) files[`study-hub-events-${m}.json`] = JSON.stringify({ app: 'study-hub', v: 2, events: byMonth[m] });
  const old = S.load('syncHashes', {});
  const send = {};
  const next = {};
  for (const name in files) {
    next[name] = hash(files[name]);
    if (old[name] !== next[name] && pulled[name] !== next[name]) send[name] = { content: files[name] };
  }
  // 조각 파일을 다 올리고 나면 예전 한 덩어리 파일은 지운다 (내용은 이미 받아서 합쳤다)
  if (S.load('syncRemote', []).includes(STATE_FILE)) send[STATE_FILE] = null;
  const names = Object.keys(send);
  if (names.length) {
    // 처음 나눠 올릴 때는 양이 많다. 한 번에 3MB 쯤씩 끊어 보낸다
    let batch = {}, size = 0;
    const raw = S.load('syncRaw', {});
    const flush = async () => {
      if (!Object.keys(batch).length) return;
      const g = await gh('/gists/' + conf().gistId, { method: 'PATCH', body: JSON.stringify({ files: batch }), wantEtag: true });
      // 내가 방금 올린 파일은 다음에 다시 받지 않게 주소를 적어 둔다
      for (const n in batch) { if (g?.files?.[n]?.raw_url) raw[n] = g.files[n].raw_url; else delete raw[n]; }
      S.save('syncRaw', raw);
      batch = {}; size = 0;
    };
    for (const n of names) {
      const len = send[n] ? send[n].content.length : 0;
      if (size && size + len > 3e6) await flush();
      batch[n] = send[n]; size += len;
    }
    await flush();
    S.save('syncRemote', S.load('syncRemote', []).filter(n => n !== STATE_FILE));
  }
  S.save('syncHashes', next);
  pulled = {};
}

// ---------- 자동 동기화 ----------
let timer = null;
export function startAuto() {
  S.onChange(() => {
    if (!isOn() || !conf().auto) return;
    clearTimeout(timer);
    timer = setTimeout(syncNow, 15000);
    setStatus('dirty', '올릴 기록 있음');
  });
  let hiddenAt = 0;
  // 인터넷이 다시 연결되면 오프라인 동안 쌓인 기록을 바로 올린다
  window.addEventListener('online', () => { if (isOn() && conf().auto) setTimeout(syncNow, 2000); });
  document.addEventListener('visibilitychange', () => {
    if (!isOn() || !conf().auto) return;
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      if (status.state === 'dirty') { clearTimeout(timer); syncNow(); }
    } else if (Date.now() - hiddenAt > 2 * 60000) syncNow();
  });
  // 화면이 켜져 있으면 1분마다 다른 기기 기록을 확인한다. 바뀐 게 없으면 304 라 거의 공짜다
  setInterval(() => { if (isOn() && conf().auto && document.visibilityState === 'visible') syncNow(); }, 60000);
  const at = S.load('syncAt', null);
  if (isOn()) { status = { state: 'ok', msg: '', at }; if (conf().auto) syncNow(); }
}
export function setAuto(v) { setConf({ auto: !!v }); }
export function gistUrl() { const c = conf(); return c.gistId ? `https://gist.github.com/${c.login || ''}/${c.gistId}` : ''; }
