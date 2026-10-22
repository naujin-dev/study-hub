// GitHub 비공개 Gist 로 공부 기록을 여러 기기에서 맞춘다.
// 토큰은 이 기기에만 저장하고 Gist 에 올리지 않는다. API 키도 올리지 않는다.
//
// Gist 파일
//   study-hub-state.json          : kv (계획, 회고, 형광펜·메모, 읽음, 시험 정보, 가져온 자료)
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
    const hit = list.find(g => g.files && g.files[STATE_FILE]);
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
  const incoming = { events: [], kv: {} };
  for (const name in g.files) {
    if (!name.startsWith('study-hub-')) continue;
    let data;
    try { data = JSON.parse(await fileText(g.files[name])); } catch (e) { continue; }
    if (name === STATE_FILE) incoming.kv = data.kv || {};
    else if (Array.isArray(data.events)) incoming.events.push(...data.events);
  }
  const changed = S.mergeIn(incoming);
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
  const files = { [STATE_FILE]: JSON.stringify({ app: 'study-hub', v: 2, u: Date.now(), kv: snap.kv }) };
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
    const h = hash(files[name]);
    next[name] = h;
    // state 파일의 u 는 매번 바뀌므로 kv 부분만 비교한다
    const cmp = name === STATE_FILE ? hash(JSON.stringify(snap.kv)) : h;
    next[name] = cmp;
    if (old[name] !== cmp) send[name] = { content: files[name] };
  }
  if (Object.keys(send).length) {
    await gh('/gists/' + conf().gistId, { method: 'PATCH', body: JSON.stringify({ files: send }) });
  }
  S.save('syncHashes', next);
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
