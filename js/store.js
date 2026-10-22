// 이 기기의 브라우저에 저장하는 값들. 모든 키는 sh. 로 시작한다.
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

// ---------- 문제 기록 ----------
// 키: "자료id::문제id"
// { n 푼 횟수, ok 맞힌 횟수, last 'ok'|'part'|'wrong', at 마지막 날짜,
//   box 복습 단계 0~5, due 다음 복습일, wrong 오답노트에 있음, streak 연속 정답,
//   ans 마지막 답, fb 마지막 AI 피드백, star 헷갈림 표시 }
const BOX_DAYS = [0, 1, 2, 4, 7, 14];

let progress = load('progress', {});
export function getProgress() { return progress; }
export function qp(key) { return progress[key] || null; }

export function recordAnswer(key, result, answer, feedback) {
  const t = today();
  const p = progress[key] || { n: 0, ok: 0, box: 0, streak: 0 };
  p.n += 1;
  p.at = t;
  p.last = result;
  p.ans = answer;
  p.fb = feedback || null;
  if (result === 'ok') {
    p.ok += 1;
    p.streak = (p.streak || 0) + 1;
    p.box = Math.min(5, (p.box || 0) + 1);
    if (p.wrong && p.streak >= 2) p.wrong = false;
  } else if (result === 'part') {
    p.streak = 0;
    p.box = Math.max(1, p.box || 0);
    p.wrong = true;
  } else {
    p.streak = 0;
    p.box = 1;
    p.wrong = true;
  }
  p.due = addDays(t, BOX_DAYS[p.box] || 1);
  progress[key] = p;
  save('progress', progress);
  logDay({ q: 1, ok: result === 'ok' ? 1 : 0 });
  return p;
}

export function setFlag(key, field, value) {
  const p = progress[key] || { n: 0, ok: 0, box: 0, streak: 0 };
  p[field] = value;
  progress[key] = p;
  save('progress', progress);
}

// 답을 고쳐서 맞음으로 인정할 때 (단답형 등에서 채점이 틀렸을 때)
export function overrideOk(key) {
  const p = progress[key];
  if (!p) return;
  if (p.last !== 'ok') {
    p.ok += 1;
    p.last = 'ok';
    p.streak = (p.streak || 0) + 1;
    p.box = Math.min(5, Math.max(1, p.box || 0) + 1);
    p.due = addDays(today(), BOX_DAYS[p.box]);
    p.wrong = false;
    logDay({ ok: 1 });
  }
  save('progress', progress);
}

// ---------- 암기카드 기록 ----------
let cards = load('cards', {});
export function cp(key) { return cards[key] || null; }
export function recordCard(key, knew) {
  const c = cards[key] || { box: 0, n: 0 };
  c.n += 1;
  c.box = knew ? Math.min(5, c.box + 1) : 0;
  c.due = addDays(today(), knew ? BOX_DAYS[c.box] : 0);
  c.at = today();
  cards[key] = c;
  save('cards', cards);
  logDay({ c: 1 });
}

// ---------- 하루 기록 ----------
export function logDay(add) {
  const log = load('log', {});
  const t = today();
  const d = log[t] || { q: 0, ok: 0, c: 0, min: 0 };
  for (const k in add) d[k] = (d[k] || 0) + add[k];
  log[t] = d;
  save('log', log);
}

// ---------- 백업 ----------
const BACKUP_KEYS = ['progress', 'cards', 'log', 'plan', 'read', 'packs', 'examLocal', 'settings', 'theme'];
export function exportAll(includeKey) {
  const out = { app: 'study-hub', exportedAt: new Date().toISOString(), data: {} };
  for (const k of BACKUP_KEYS) {
    let v = load(k, null);
    if (k === 'settings' && v && !includeKey) v = { ...v, apiKey: '' };
    if (v != null) out.data[k] = v;
  }
  return out;
}
export function importAll(obj) {
  if (!obj || obj.app !== 'study-hub' || !obj.data) throw new Error('이 사이트에서 내보낸 백업 파일이 아니다.');
  for (const k of BACKUP_KEYS) {
    if (k in obj.data) {
      if (k === 'settings') {
        const cur = load('settings', {});
        const next = { ...cur, ...obj.data.settings };
        if (!obj.data.settings.apiKey) next.apiKey = cur.apiKey || '';
        save(k, next);
      } else save(k, obj.data[k]);
    }
  }
}
export function resetProgress() {
  for (const k of ['progress', 'cards', 'log', 'read']) remove(k);
  progress = {};
  cards = {};
}
