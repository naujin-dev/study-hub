// 이 기기의 브라우저에 저장하는 값들. 모든 키는 sh. 로 시작한다.
//
// 공부 기록은 두 가지로 나눠 쌓는다. 둘 다 Gist 동기화로 여러 기기에서 합칠 수 있다.
//   events : 일어난 일을 시간순으로 쌓기만 한다 (문제 풀이, 카드, 읽기, 타이머...).
//            푼 기록·복습 일정·하루 기록은 전부 events 를 처음부터 다시 계산해서 만든다.
//   kv     : 고칠 수 있는 것 (계획, 하루 회고, 형광펜·메모, 읽음 표시, 시험 정보, 가져온 자료).
//            항목마다 고친 시각 u 가 있어서 두 기기가 다르면 늦게 고친 쪽을 쓴다.
const P = 'sh.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(P + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(P + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('저장 실패', key, e);
    if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new CustomEvent('sh-save-failed', { detail: key }));
    return false;
  }
}

export function remove(key) {
  try { localStorage.removeItem(P + key); } catch (e) {}
}

// ---------- 날짜 ----------
export function today() {
  return ymd(new Date());
}
export function ymd(d) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}
export function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  const w = '일월화수목금토'[d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${w})`;
}
export function fmtTime(t) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function fmtDur(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return `${sec}초`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간${m % 60 ? ' ' + (m % 60) + '분' : ''}`;
}
const dayOf = t => ymd(new Date(t));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- 바뀜 알림 (동기화가 듣는다) ----------
const listeners = [];
export function onChange(fn) { listeners.push(fn); }
function changed() { listeners.forEach(fn => { try { fn(); } catch (e) {} }); }

// ================= events =================
// 공통: { id, t(ms), k(종류) }
//  a 문제 풀이  { key, r:'ok'|'part'|'wrong', ans, fb, ms, skip }
//  o 맞음으로 고침 { key }
//  f 표시 바꿈  { key, f:'star'|'wrong', v }
//  c 카드      { key, knew, ms }
//  r 자료 읽기  { pack, s(초) }
//  m 집중 타이머 { min }
//  x 실전 끝   { n, ok, part, sc, mx, min, subj }
//  q 자료 질문  { pack, text }
//  g 문제 만들기 { pack, n }
let events = load('events', []);
const BOX_DAYS = [0, 1, 2, 4, 7, 14];

let D = null; // 다시 계산한 결과
function emptyDay() { return { q: 0, ok: 0, part: 0, c: 0, min: 0, read: 0, solve: 0, card: 0 }; }

function applyEvent(e) {
  const day = dayOf(e.t);
  const L = D.log[day] || (D.log[day] = emptyDay());
  if (e.k === 'a') {
    const p = D.progress[e.key] || (D.progress[e.key] = { n: 0, ok: 0, box: 0, streak: 0 });
    p.n += 1; p.at = day; p.last = e.r; p.ans = e.ans; p.fb = e.fb || null;
    if (e.r === 'ok') {
      p.ok += 1; p.streak += 1; p.box = Math.min(5, p.box + 1);
      if (p.wrong && p.streak >= 2) p.wrong = false;
    } else if (e.r === 'part') {
      p.streak = 0; p.box = Math.max(1, p.box); p.wrong = true;
    } else {
      p.streak = 0; p.box = 1; p.wrong = true;
    }
    p.due = addDays(day, BOX_DAYS[p.box] || 1);
    (D.attempts[e.key] || (D.attempts[e.key] = [])).push(e);
    L.q += 1; if (e.r === 'ok') L.ok += 1; if (e.r === 'part') L.part += 1;
    L.solve += Math.min(900, (e.ms || 0) / 1000);
  } else if (e.k === 'o') {
    const p = D.progress[e.key];
    if (p && p.last !== 'ok') {
      p.ok += 1; p.last = 'ok'; p.streak += 1;
      p.box = Math.min(5, Math.max(1, p.box) + 1);
      p.due = addDays(day, BOX_DAYS[p.box]); p.wrong = false;
      L.ok += 1;
      const at = D.attempts[e.key]; if (at && at.length) at[at.length - 1] = { ...at[at.length - 1], r: 'ok', overridden: true };
    }
  } else if (e.k === 'f') {
    const p = D.progress[e.key] || (D.progress[e.key] = { n: 0, ok: 0, box: 0, streak: 0 });
    p[e.f] = e.v;
  } else if (e.k === 'c') {
    const c = D.cards[e.key] || (D.cards[e.key] = { box: 0, n: 0 });
    c.n += 1; c.box = e.knew ? Math.min(5, c.box + 1) : 0;
    c.due = addDays(day, e.knew ? BOX_DAYS[c.box] : 0); c.at = day;
    L.c += 1; L.card += Math.min(120, (e.ms || 0) / 1000);
  } else if (e.k === 'r') {
    D.readTime[e.pack] = (D.readTime[e.pack] || 0) + e.s;
    L.read += e.s;
  } else if (e.k === 'm') {
    L.min += e.min;
  }
}

function rebuild() {
  events.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
  D = { progress: {}, cards: {}, log: {}, attempts: {}, readTime: {} };
  for (const e of events) applyEvent(e);
}

function addEvent(k, data) {
  const e = { id: newId(), t: Date.now(), k, ...data };
  events.push(e);
  applyEvent(e);
  save('events', events);
  changed();
  return e;
}

export function getEvents() { return events; }
export function getProgress() { return D.progress; }
export function qp(key) { return D.progress[key] || null; }
export function cp(key) { return D.cards[key] || null; }
export function getLog() { return D.log; }
export function attemptsOf(key) { return D.attempts[key] || []; }
export function readTimeOf(pack) { return D.readTime[pack] || 0; }
export function getReadTime() { return D.readTime; }

// 하루 공부 시간(초): 자료 읽기 + 문제 풀이 + 카드
export function studySec(dayLog) {
  if (!dayLog) return 0;
  return (dayLog.read || 0) + (dayLog.solve || 0) + (dayLog.card || 0);
}

// 서술형 피드백은 저장 공간을 아끼려고 줄여서 둔다.
function slimFb(fb) {
  if (!fb) return null;
  const o = { ...fb };
  if (o.criteria) o.criteria = o.criteria.map(c => ({ criterion: c.criterion, earned: c.earned, max: c.max, comment: c.comment }));
  return o;
}

export function recordAnswer(key, result, answer, feedback, ms, extra = {}) {
  addEvent('a', { key, r: result, ans: answer, fb: slimFb(feedback), ms: Math.round(ms || 0), ...extra });
  return D.progress[key];
}
export function setFlag(key, field, value) { addEvent('f', { key, f: field, v: value }); }
export function overrideOk(key) { addEvent('o', { key }); }
export function recordCard(key, knew, ms) { addEvent('c', { key, knew, ms: Math.round(ms || 0) }); }
export function recordRead(pack, sec) { if (sec >= 10) addEvent('r', { pack, s: Math.round(sec) }); }
export function recordFocus(min) { if (min > 0) addEvent('m', { min }); }
export function recordExam(summary) { addEvent('x', summary); }
export function recordAsk(pack, text) { addEvent('q', { pack, text: String(text).slice(0, 300) }); }
export function recordGen(pack, n) { addEvent('g', { pack, n }); }

// ================= kv =================
// kv[모음][id] = { ...값, u: 고친 시각(ms), del?: true }
let kv = load('kv', {});
export function kvAll(col) {
  const o = kv[col] || {};
  const out = {};
  for (const id in o) if (!o[id].del) out[id] = o[id];
  return out;
}
export function kvGet(col, id) {
  const v = kv[col] && kv[col][id];
  return v && !v.del ? v : null;
}
export function kvSet(col, id, value) {
  (kv[col] || (kv[col] = {}))[id] = { ...value, u: Date.now() };
  save('kv', kv);
  changed();
}
export function kvDel(col, id) {
  if (!kv[col] || !kv[col][id]) return;
  kv[col][id] = { del: true, u: Date.now() };
  save('kv', kv);
  changed();
}

// ================= 합치기 (동기화, 백업 불러오기) =================
export function snapshot() {
  return { events, kv };
}
// 다른 곳에서 온 기록을 합친다. 바뀐 게 있으면 true.
export function mergeIn(other) {
  let changedAny = false;
  if (Array.isArray(other.events)) {
    const have = new Set(events.map(e => e.id));
    for (const e of other.events) if (e && e.id && !have.has(e.id)) { events.push(e); have.add(e.id); changedAny = true; }
  }
  if (other.kv) {
    for (const col in other.kv) {
      const mine = kv[col] || (kv[col] = {});
      for (const id in other.kv[col]) {
        const v = other.kv[col][id];
        if (!v || typeof v.u !== 'number') continue;
        if (!mine[id] || mine[id].u < v.u) { mine[id] = v; changedAny = true; }
      }
    }
  }
  if (changedAny) {
    rebuild();
    save('events', events);
    save('kv', kv);
  }
  return changedAny;
}

// ---------- 백업 ----------
export function exportAll() {
  return { app: 'study-hub', v: 2, exportedAt: new Date().toISOString(), events, kv, prefs: { theme: load('theme', 'auto'), settings: { ...load('settings', {}), apiKey: '' } } };
}
export function importAll(obj) {
  if (!obj || obj.app !== 'study-hub') throw new Error('이 사이트에서 내보낸 백업 파일이 아니다.');
  if (obj.v === 2) {
    mergeIn(obj);
    return;
  }
  // 예전 형식 백업
  if (obj.data) migrateOld(obj.data);
}

// 기록을 모두 지운다 (자료·설정은 남긴다)
export function resetProgress() {
  events = events.filter(e => !['a', 'o', 'f', 'c', 'r', 'm', 'x'].includes(e.k));
  save('events', events);
  rebuild();
}

export function storageBytes() {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(P)) n += (k.length + (localStorage.getItem(k) || '').length) * 2;
    }
  } catch (e) {}
  return n;
}

// ---------- 예전 저장 형식 옮기기 ----------
function migrateOld(src) {
  const get = k => (src ? src[k] : load(k, null));
  const progress = get('progress');
  if (progress) {
    for (const key in progress) {
      const p = progress[key];
      if (!p.n) continue;
      const t = new Date((p.at || today()) + 'T12:00:00').getTime();
      events.push({ id: newId(), t, k: 'a', key, r: p.last || 'wrong', ans: p.ans, fb: p.fb || null, ms: 0, migrated: true });
      if (p.star) events.push({ id: newId(), t: t + 1, k: 'f', key, f: 'star', v: true });
    }
  }
  const cards = get('cards');
  if (cards) for (const key in cards) {
    const c = cards[key];
    const t = new Date((c.at || today()) + 'T12:00:00').getTime();
    events.push({ id: newId(), t, k: 'c', key, knew: c.box > 0, ms: 0, migrated: true });
  }
  const log = get('log');
  if (log) for (const day in log) if (log[day].min) events.push({ id: newId(), t: new Date(day + 'T12:00:00').getTime(), k: 'm', min: log[day].min });
  const now = Date.now();
  const plan = get('plan');
  if (Array.isArray(plan)) for (const p of plan) (kv.plan || (kv.plan = {}))[p.id] = { ...p, u: now };
  const read = get('read');
  if (read) for (const id in read) (kv.readmark || (kv.readmark = {}))[id] = { date: read[id], u: now };
  const packs = get('packs');
  if (packs) for (const id in packs) (kv.packs || (kv.packs = {}))[id] = { pack: packs[id], u: now };
  const ex = get('examLocal');
  if (ex) for (const id in ex) (kv.exam || (kv.exam = {}))[id] = { ...ex[id], u: now };
  save('events', events);
  save('kv', kv);
  if (!src) for (const k of ['progress', 'cards', 'log', 'plan', 'read', 'packs', 'examLocal']) remove(k);
  rebuild();
}

// 시작할 때 한 번
if (!load('events', null) && (load('progress', null) || load('plan', null) || load('packs', null))) migrateOld(null);
rebuild();

// 브라우저가 저장 공간을 마음대로 비우지 않게 요청한다.
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
