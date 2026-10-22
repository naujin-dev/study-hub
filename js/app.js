import * as S from './store.js';
import * as D from './data.js';
import * as AI from './ai.js';
import * as SYNC from './sync.js';
import * as HL from './hl.js';
import * as CH from './charts.js';
import * as PR from './prompts.js';
import * as SRC from './src.js';

const { SUBJECTS, SUBJ, TYPE_NAME } = D;
const main = document.getElementById('main');
const REPO_URL = 'https://github.com/naujin-dev/study-hub';

// ---------- 작은 도구 ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = main) => root.querySelector(sel);
const $$ = (sel, root = main) => [...root.querySelectorAll(sel)];
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const subjDot = id => `<span class="dot" style="--c:${SUBJ[id]?.color || 'var(--acc)'}"></span>`;
const subjName = id => SUBJ[id]?.name || id;

function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

// 물결표 하나(~)는 "1~4구" 처럼 범위를 쓸 때 흔해서 취소선으로 바꾸지 않는다.
// 취소선은 물결표 두 개(~~글~~)로 쓴 것만 그린다.
let mdReady = false;
function setupMarked() {
  if (mdReady || !window.marked) return;
  window.marked.use({
    tokenizer: {
      del(src) {
        const m = /^~~(?=[^\s~])([\s\S]*?[^\s~])~~(?!~)/.exec(src);
        if (m) return { type: 'del', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
        return undefined;
      },
    },
  });
  mdReady = true;
}

function md(text) {
  if (!text) return '';
  setupMarked();
  if (window.marked && window.DOMPurify) {
    return window.DOMPurify.sanitize(window.marked.parse(text, { gfm: true, breaks: false }));
  }
  return `<p style="white-space:pre-wrap">${esc(text)}</p>`;
}

function params() {
  const h = location.hash.slice(1) || '/';
  const [path, qs] = h.split('?');
  return { path, q: new URLSearchParams(qs || '') };
}

function chipGroup(name, items, selected, multi = true) {
  return `<div class="chips" data-group="${name}">${items.map(it => {
    const on = selected.includes(it.value);
    return `<label class="chip"><input type="${multi ? 'checkbox' : 'radio'}" name="${name}" value="${esc(it.value)}"${on ? ' checked' : ''}>${it.dot ? subjDot(it.value) : ''}${esc(it.label)}</label>`;
  }).join('')}</div>`;
}
const picked = name => $$(`input[name="${name}"]:checked`).map(i => i.value);

// ---------- 기록 헬퍼 ----------
const readMarks = () => S.kvAll('readmark');
// Notion 주간 계획(data/plan.json)의 할 일. 체크 상태는 kv 'plan' 에 같은 id 로 덮어쓴다.
const stripDate = t => t.replace(/^(\S+\s)?\d{1,2}\/\d{1,2}(\([월화수목금토일]\))?(~\d{1,2})?\s*/, (m, pre) => pre && !/\d/.test(pre) ? pre : '');
function notionItems() {
  const p = D.db().plan;
  if (!p || !Array.isArray(p.weeks)) return [];
  const out = [];
  for (const w of p.weeks) for (const g of w.groups || []) for (const it of g.items || []) {
    out.push({ id: it.id, date: it.date || null, subject: g.subject || '', label: g.label || '', text: it.self ? it.text : stripDate(it.text), raw: it.text, group: it.self ? '' : g.title, week: w.id, done: !!it.done, notion: true });
  }
  return out;
}
function planList() {
  const kv = S.kvAll('plan');
  const nis = notionItems();
  const ids = new Set(nis.map(n => n.id));
  const merged = nis.map(n => (kv[n.id] ? { ...n, ...kv[n.id], notion: true, text: n.text, group: n.group, date: n.date } : n));
  const mine = Object.values(kv).filter(x => !ids.has(x.id) && !x.notion).map(p => ({ ...p }));
  return [...merged, ...mine].sort((a, b) => ((a.date || '9') + a.id).localeCompare((b.date || '9') + b.id));
}
function setPlan(id, patch) {
  const cur = S.kvGet('plan', id) || notionItems().find(n => n.id === id);
  if (!cur) return;
  const { u, ...rest } = cur;
  S.kvSet('plan', id, rest.notion ? { id, notion: true, done: rest.done, ...patch } : { ...rest, ...patch });
}
const planLine = p => `${p.subject ? subjDot(p.subject) + ' ' : p.label ? `<span class="tag">${esc(p.label)}</span> ` : ''}${esc(p.text)}${p.group ? `<br><span class="small muted">${esc(p.group.length > 60 ? p.group.slice(0, 60) + '…' : p.group)}</span>` : ''}`;

// ---------- 시험 날짜 ----------
function examInfo() {
  const ex = D.db().exam || { days: [], subjects: {} };
  const days = (ex.days || []).slice().sort();
  const first = days[0] || null;
  return { ...ex, days, first };
}
function dLabel(date) {
  if (!date) return '';
  const n = S.daysBetween(S.today(), date);
  if (n > 0) return `D-${n}`;
  if (n === 0) return 'D-day';
  return '끝남';
}
function subjDate(id) {
  return examInfo().subjects?.[id]?.date || null;
}

// ---------- 화면 모드 ----------
const themeBtn = document.getElementById('themeBtn');
function applyTheme() {
  const t = S.load('theme', 'auto');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  themeBtn.textContent = { auto: '자동', light: '밝게', dark: '어둡게' }[t] || '자동';
}
themeBtn.addEventListener('click', () => {
  const order = ['auto', 'light', 'dark'];
  const t = S.load('theme', 'auto');
  S.save('theme', order[(order.indexOf(t) + 1) % 3]);
  applyTheme();
});

// ---------- 라우터 ----------
const routes = {
  '/': viewHome,
  '/study': viewStudy,
  '/pack': viewPack,
  '/quiz': viewQuizSetup,
  '/run': viewRun,
  '/wrong': viewWrong,
  '/cards': viewCardsSetup,
  '/flash': viewFlash,
  '/gen': viewGen,
  '/plan': viewPlan,
  '/stats': viewStats,
  '/settings': viewSettings,
  '/more': viewMore,
  '/journal': viewJournal,
  '/marks': viewMarks,
  '/q': viewQuestion,
  '/prompts': viewPrompts,
  '/blank': viewBlank,
  '/final': viewFinal,
  '/check': viewCheck,
  '/help': viewHelp,
};
const navOf = { '/': 'home', '/study': 'study', '/pack': 'study', '/quiz': 'quiz', '/run': 'quiz', '/wrong': 'wrong' };

let onLeave = null;
function render() {
  if (onLeave) { const f = onLeave; onLeave = null; try { f(); } catch (e) { console.warn(e); } }
  hideSelBar();
  const { path } = params();
  const fn = routes[path] || viewHome;
  $$('.bottom a', document).forEach(a => a.classList.toggle('on', a.dataset.nav === (navOf[path] || 'more')));
  main.innerHTML = '';
  fn();
  updateTop();
  if (!render.keepScroll) window.scrollTo(0, 0);
  render.keepScroll = false;
}
window.addEventListener('hashchange', render);

function updateTop() {
  const ex = examInfo();
  document.getElementById('topDday').textContent = ex.first ? `${ex.title || '2회고사'} ${dLabel(ex.first)}` : '';
}

// ---------- 통계 계산 ----------
function subjectStats() {
  const prog = S.getProgress();
  const out = {};
  for (const s of SUBJECTS) out[s.id] = { total: 0, tried: 0, n: 0, ok: 0, wrong: 0, due: 0, packs: 0, unread: 0 };
  const read = readMarks();
  for (const p of D.db().packs) {
    const o = out[p.subject];
    if (!o) continue;
    o.packs++;
    if (!read[p.id] && p.notes) o.unread++;
    for (const q of p.questions || []) {
      const r = prog[D.qkey(p, q)];
      o.total++;
      if (r && r.n) {
        o.tried++;
        o.n += r.n;
        o.ok += r.ok;
        if (r.wrong) o.wrong++;
        if (r.due && r.due <= S.today()) o.due++;
      }
    }
  }
  return out;
}
function dueItems() {
  const prog = S.getProgress();
  const t = S.today();
  return D.allQuestions().filter(x => { const r = prog[x.key]; return r && r.n && r.due && r.due <= t; });
}
function wrongItems() {
  const prog = S.getProgress();
  return D.allQuestions().filter(x => prog[x.key]?.wrong);
}
function unitStats() {
  const prog = S.getProgress();
  return D.db().packs.map(p => {
    let n = 0, ok = 0, tried = 0;
    for (const q of p.questions || []) {
      const r = prog[D.qkey(p, q)];
      if (r && r.n) { tried++; n += r.n; ok += r.ok; }
    }
    return { pack: p, n, ok, tried, total: (p.questions || []).length, rate: n ? ok / n : null };
  });
}
const studied = l => !!(l && (l.q || l.c || l.min || l.read >= 60));
function streakDays() {
  const log = S.getLog();
  let d = S.today(), n = 0;
  if (!studied(log[d])) d = S.addDays(d, -1);
  while (studied(log[d])) { n++; d = S.addDays(d, -1); }
  return n;
}

// ================= 홈 =================
function viewHome() {
  const ex = examInfo();
  const st = subjectStats();
  const due = dueItems();
  const wrong = wrongItems();
  const packs = D.db().packs;
  const t = S.today();
  const plan = planList().filter(p => p.date === t && !p.hidden);
  const curWeek = (D.db().plan?.weeks || []).find(w => w.start <= t && t <= w.end);
  const weekLeft = curWeek ? planList().filter(p => p.notion && p.week === curWeek.id && !p.date && !p.done && !p.hidden).length : 0;
  const log = S.getLog()[t] || { q: 0, ok: 0, c: 0, min: 0, read: 0, solve: 0, card: 0 };
  const lastRead = [...S.getEvents()].reverse().find(e => e.k === 'r' && D.db().byId[e.pack]);
  const pos = lastRead ? S.kvGet('pos', lastRead.pack) : null;

  const dayRows = ex.days.map(d => {
    const subs = SUBJECTS.filter(s => ex.subjects[s.id]?.date === d);
    return `<li class="item"><span class="mono" style="min-width:4.2em">${dLabel(d)}</span><span class="grow">${S.fmtDate(d)}</span><span class="small muted">${subs.length ? subs.map(s => s.name).join(', ') : '과목 미정'}</span></li>`;
  }).join('');

  const weak = unitStats().filter(u => u.n >= 3).sort((a, b) => a.rate - b.rate).slice(0, 3);

  // 과목별 하루 목표: 아직 안 푼 문제 + 오답 / 남은 날
  const goals = SUBJECTS.map(s => {
    const o = st[s.id];
    const date = subjDate(s.id) || ex.first;
    if (!date || !o.total) return null;
    const left = Math.max(1, S.daysBetween(t, date));
    const todo = (o.total - o.tried) + o.wrong;
    if (S.daysBetween(t, date) < 0) return null;
    return { s, per: Math.ceil(todo / left), todo, left };
  }).filter(Boolean).filter(g => g.todo > 0);

  main.innerHTML = `
  ${D.db().loadErrors.length ? `<div class="note" style="margin-bottom:12px"><b>자료를 일부 못 읽었다.</b><br>${D.db().loadErrors.slice(0, 5).map(esc).join('<br>')}</div>` : ''}
  <section class="card">
    <p class="muted small" style="margin:0">${esc(ex.title || '2회고사')}</p>
    <h1 style="font-size:2rem;margin:.1em 0 .2em" class="mono">${ex.first ? dLabel(ex.first) : '날짜 미정'}</h1>
    <ul class="list">${dayRows || '<li class="item muted">data/exam.json 에 시험 날짜가 없다.</li>'}</ul>
    <div class="row" style="margin-top:8px"><a class="btn sm ghost" href="#/plan">과목별 날짜·범위 정하기</a></div>
  </section>

  ${!packs.length ? `<section class="card"><h2>아직 공부자료가 없다</h2>
    <p>과목별 공부자료 Claude 에게 <a href="#/prompts">프롬프트</a> 를 복사해서 보내고 자료를 받은 뒤,</p>
    <ul><li>채팅 Claude 가 준 JSON 은 <a href="#/settings">설정 → 자료 가져오기</a> 에 붙여넣거나</li><li>Claude Code 에게 저장소에 바로 올리게 하면 된다.</li></ul></section>` : ''}

  <section class="grid" style="margin-bottom:14px">
    <a class="stat" href="#/run?src=due" style="text-decoration:none;color:inherit"><b>${due.length}</b><span>오늘 복습할 문제</span></a>
    <a class="stat" href="#/wrong" style="text-decoration:none;color:inherit"><b style="color:var(--bad)">${wrong.length}</b><span>오답노트</span></a>
    <div class="stat"><b>${log.q}</b><span>오늘 푼 문제 (${pct(log.ok, log.q)}%)</span></div>
    <a class="stat" href="#/journal" style="text-decoration:none;color:inherit"><b>${S.fmtDur(S.studySec(log))}</b><span>오늘 공부 시간 · 연속 ${streakDays()}일</span></a>
  </section>
  ${lastRead ? `<a class="subj" href="#/pack?id=${encodeURIComponent(lastRead.pack)}&resume=1" style="margin-bottom:14px">${subjDot(D.db().byId[lastRead.pack].subject)}<div class="grow"><span class="small muted">이어 읽기 · ${S.fmtDate(S.ymd(new Date(lastRead.t)))} ${S.fmtTime(lastRead.t)}</span><br><b>${esc(D.db().byId[lastRead.pack].title)}</b>${pos ? ` <span class="small muted">${Math.round(pos.r * 100)}% 지점</span>` : ''}</div>›</a>` : ''}

  <div class="row" style="margin-bottom:6px">
    ${due.length ? `<a class="btn pri" href="#/run?src=due">복습 ${due.length}문제 풀기</a>` : ''}
    ${wrong.length ? `<a class="btn" href="#/run?src=wrong">오답 다시 풀기</a>` : ''}
    <a class="btn" href="#/quiz">문제 고르기</a>
    ${D.allQuestions().length ? '<button class="btn" id="mixBtn" title="과목을 번갈아 섞어서 푼다 (인터리빙)">섞어 풀기 20</button>' : ''}
    <a class="btn" href="#/cards">암기카드</a>
  </div>

  ${(() => {
    const near = SUBJECTS.filter(s => { const d = subjDate(s.id); return d && S.daysBetween(t, d) >= 0 && S.daysBetween(t, d) <= 3; });
    return near.length ? `<section class="card flat" style="border-color:var(--bad)"><b>시험이 코앞이다</b><div class="row" style="margin-top:8px">${near.map(s => `<a class="btn sm" href="#/final?s=${s.id}">${subjDot(s.id)} ${s.name} 시험 전 정리 (${dLabel(subjDate(s.id))})</a>`).join('')}</div></section>` : '';
  })()}
  ${(() => { const n = checkAll().filter(x => x.level === 'err').length; return n ? `<p class="note" style="margin-bottom:12px">공부자료에 고칠 곳이 ${n}개 있다. <a href="#/check">자료 점검 보기</a></p>` : ''; })()}
  ${plan.length ? `<div class="sec-title"><h2>오늘 계획</h2><a class="small" href="#/plan">전체 보기</a></div>
  <section class="card flat"><ul class="list">${plan.map(p => `<li><label class="item" style="align-items:flex-start"><input type="checkbox" data-plan="${p.id}"${p.done ? ' checked' : ''} style="margin-top:5px"><span class="grow"${p.done ? ' style="text-decoration:line-through;color:var(--ink3)"' : ''}>${planLine(p)}</span></label></li>`).join('')}</ul>
  <p class="small muted" style="margin:8px 0 0">끝낸 것 ${plan.filter(p => p.done).length}/${plan.length}${weekLeft ? ` · 이번 주 날짜 없는 할 일 ${weekLeft}개 남음` : ''}</p></section>` : ''}

  ${goals.length ? `<div class="sec-title"><h2>하루 목표</h2><span class="small muted">안 푼 문제 + 오답 ÷ 남은 날</span></div>
  <section class="card flat"><ul class="list">${goals.map(g => `<li class="item">${subjDot(g.s.id)}<span class="grow">${g.s.name}</span><span class="small muted">${g.todo}문제 · ${g.left}일</span><b class="mono">하루 ${g.per}</b></li>`).join('')}</ul></section>` : ''}

  <div class="sec-title"><h2>과목</h2></div>
  <section class="stack subj-grid">
    ${SUBJECTS.map(s => {
      const o = st[s.id];
      const date = subjDate(s.id);
      return `<a class="subj" href="#/study?s=${s.id}">${subjDot(s.id)}
        <div class="grow">
          <div class="row between"><b>${s.name}</b><span class="small muted">${date ? `${S.fmtDate(date)} · ${dLabel(date)}` : '날짜 미정'}</span></div>
          <div class="bar" style="--c:${s.color};margin:6px 0 4px"><i style="width:${pct(o.tried, o.total)}%"></i></div>
          <div class="small muted">자료 ${o.packs}개${o.unread ? ` (안 읽음 ${o.unread})` : ''} · 문제 ${o.tried}/${o.total} · 정답률 ${o.n ? pct(o.ok, o.n) + '%' : '-'}${o.wrong ? ` · 오답 ${o.wrong}` : ''}</div>
        </div></a>`;
    }).join('')}
  </section>

  ${weak.length ? `<div class="sec-title"><h2>약한 단원</h2><span class="small muted">정답률 낮은 순</span></div>
  <section class="card flat"><ul class="list">${weak.map(u => `<li><a class="item" href="#/pack?id=${encodeURIComponent(u.pack.id)}">${subjDot(u.pack.subject)}<span class="grow">${esc(u.pack.title)}</span><span class="tag bad">${Math.round(u.rate * 100)}%</span></a></li>`).join('')}</ul></section>` : ''}
  `;
  $('#mixBtn')?.addEventListener('click', () => {
    const items = mixItems(20);
    if (!items.length) return toast('섞어 풀 문제가 없다. 다 맞혔다!');
    startSession(items, 'practice');
  });
  $$('[data-plan]').forEach(cb => cb.addEventListener('change', () => {
    setPlan(cb.dataset.plan, { done: cb.checked, doneAt: cb.checked ? Date.now() : null });
    render.keepScroll = true; render();
  }));
}

// ================= 자료 목록 =================
function viewStudy() {
  const { q } = params();
  const sel = q.get('s') || '';
  const term = (q.get('q') || '').trim();
  const read = readMarks();
  const prog = S.getProgress();
  let packs = D.db().packs.filter(p => !sel || p.subject === sel);

  let results = '';
  if (term) {
    const low = term.toLowerCase();
    const hits = [];
    for (const p of D.db().packs) {
      const where = [];
      if ((p.title + ' ' + (p.unit || '')).toLowerCase().includes(low)) where.push('제목');
      const ni = (p.notes || '').toLowerCase().indexOf(low);
      if (ni >= 0) where.push('…' + p.notes.slice(Math.max(0, ni - 30), ni + 50).replace(/\s+/g, ' ') + '…');
      const qc = (p.questions || []).filter(x => (x.question + ' ' + (x.context || '')).toLowerCase().includes(low)).length;
      if (qc) where.push(`문제 ${qc}개`);
      const cc = (p.cards || []).filter(c => (c.front + ' ' + c.back).toLowerCase().includes(low)).length;
      if (cc) where.push(`카드 ${cc}개`);
      if (where.length) hits.push({ p, where });
    }
    results = `<section class="card flat"><h2>"${esc(term)}" 찾은 결과 ${hits.length}개</h2><ul class="list">${hits.map(h => `<li><a class="item" href="#/pack?id=${encodeURIComponent(h.p.id)}&hl=${encodeURIComponent(term)}">${subjDot(h.p.subject)}<span class="grow"><b>${esc(h.p.title)}</b><br><span class="small muted">${h.where.map(esc).join(' · ')}</span></span></a></li>`).join('') || '<li class="item muted">없다.</li>'}</ul></section>`;
  }

  const groups = SUBJECTS.filter(s => !sel || s.id === sel).map(s => {
    const list = packs.filter(p => p.subject === s.id);
    if (!list.length) return sel ? `<p class="muted">${s.name} 자료가 아직 없다.</p>` : '';
    return `<div class="sec-title"><h2>${subjDot(s.id)} ${s.name}</h2><span class="small muted">${list.length}개</span></div>
    <section class="card flat"><ul class="list">${list.map(p => {
      const qs = p.questions || [];
      const tried = qs.filter(x => prog[D.qkey(p, x)]?.n).length;
      return `<li><a class="item" href="#/pack?id=${encodeURIComponent(p.id)}">
        <span class="grow"><b>${esc(p.title)}</b>${p.unit && p.unit !== p.title ? `<br><span class="small muted">${esc(p.unit)}</span>` : ''}</span>
        ${p._src === 'local' ? '<span class="tag vio">내 기기</span>' : ''}
        ${read[p.id] ? '<span class="tag ok">읽음</span>' : ''}
        ${qs.length ? `<span class="tag">${tried}/${qs.length}</span>` : ''}
      </a></li>`;
    }).join('')}</ul></section>`;
  }).join('');

  main.innerHTML = `
  <h1>공부자료</h1>
  <form id="sf" class="row" style="margin:8px 0 10px"><input type="search" name="q" placeholder="자료, 문제, 카드에서 찾기" value="${esc(term)}" style="flex:1"><button class="btn">찾기</button></form>
  ${chipGroup('s', [{ value: '', label: '전체' }, ...SUBJECTS.map(s => ({ value: s.id, label: s.name, dot: true }))], [sel], false)}
  ${results}
  ${groups || '<p class="muted" style="margin-top:16px">자료가 없다. <a href="#/settings">설정 → 자료 가져오기</a></p>'}
  `;
  $$('input[name="s"]').forEach(r => r.addEventListener('change', () => { location.hash = '#/study' + (r.value ? '?s=' + r.value : ''); }));
  $('#sf').addEventListener('submit', e => {
    e.preventDefault();
    const v = e.target.q.value.trim();
    const ps = new URLSearchParams();
    if (sel) ps.set('s', sel);
    if (v) ps.set('q', v);
    location.hash = '#/study' + (ps.toString() ? '?' + ps : '');
  });
}

// ================= 자료 하나 =================
let chatHistory = {};

// 자료를 실제로 보고 있던 시간만 센다: 화면이 켜져 있고 90초 안에 손댄 적이 있을 때
const reader = {
  pack: null, sec: 0, last: 0, active: 0, timer: null,
  start(packId) {
    if (this.pack === packId && this.timer) return;
    this.stop();
    this.pack = packId; this.sec = 0; this.last = Date.now(); this.active = Date.now();
    this.timer = setInterval(() => this.tick(), 5000);
  },
  touch() { this.active = Date.now(); },
  tick() {
    const now = Date.now();
    if (this.pack && document.visibilityState === 'visible' && now - this.active < 90000) this.sec += (now - this.last) / 1000;
    this.last = now;
    const el = document.getElementById('readNow');
    if (el) el.textContent = S.fmtDur(S.readTimeOf(this.pack) + this.sec);
  },
  flush() {
    if (!this.pack) return;
    this.tick();
    if (this.sec >= 10) { S.recordRead(this.pack, this.sec); this.sec = 0; }
  },
  stop() {
    if (!this.pack) return;
    this.flush();
    clearInterval(this.timer);
    this.pack = null;
  },
};
['scroll', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => window.addEventListener(ev, () => reader.touch(), { passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { reader.flush(); savePos(); }
  else reader.last = Date.now();
});

function savePos() {
  if (!reader.pack) return;
  const el = document.getElementById('notes');
  if (!el) return;
  const r = el.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (-r.top + 80) / Math.max(1, r.height)));
  const prev = S.kvGet('pos', reader.pack);
  if (!prev || Math.abs(prev.r - ratio) > 0.02) S.kvSet('pos', reader.pack, { r: Math.round(ratio * 1000) / 1000 });
}

function viewPack() {
  const { q } = params();
  const p = D.db().byId[q.get('id')];
  if (!p) { main.innerHTML = '<p>자료를 찾지 못했다. <a href="#/study">목록으로</a></p>'; return; }
  const read = readMarks();
  const prog = S.getProgress();
  const qs = p.questions || [];
  const cnt = t => qs.filter(x => x.type === t).length;
  const tried = qs.filter(x => prog[D.qkey(p, x)]?.n).length;
  const ok = qs.reduce((s, x) => s + (prog[D.qkey(p, x)]?.ok || 0), 0);
  const n = qs.reduce((s, x) => s + (prog[D.qkey(p, x)]?.n || 0), 0);
  const hist = chatHistory[p.id] || [];
  const hl = q.get('hl');
  const marks = Object.values(S.kvAll('hl')).filter(h => h.pack === p.id).sort((a, b) => a.c - b.c);
  const memo = S.kvGet('pnote', p.id);
  const readEvents = S.getEvents().filter(e => e.k === 'r' && e.pack === p.id);
  const pos = S.kvGet('pos', p.id);
  // 본문 같이 보기
  const texts = SRC.textsOf(p);
  const srcPref = S.load('srcOn', null);
  const srcOn = q.get('src') ? true : (srcPref == null ? texts.length > 0 : srcPref);
  let curTid = q.get('src') || S.load('srcTab', {})[p.id];
  if (!texts.find(t => t.tid === curTid)) curTid = texts[0]?.tid;
  const cur = texts.find(t => t.tid === curTid);
  const lnOn = S.load('srcLn', false);
  const notesMarks = marks.filter(h => !h.where);
  const srcMarks = cur ? marks.filter(h => h.where === 'src:' + cur.tid) : [];
  const srcPane = `<section class="card src-pane" id="srcPane">
    <div class="row between"><b>본문</b><span class="row">${cur ? `<label class="small"><input type="checkbox" id="lnOn"${lnOn ? ' checked' : ''}> 행 번호</label><button class="btn sm ghost" id="srcEdit">고치기</button>` : ''}<button class="btn sm ghost" id="srcAdd">+ 붙여넣기</button><label class="btn sm ghost">+ 사진<input type="file" id="srcImg" accept="image/*" multiple hidden></label></span></div>
    ${texts.length > 1 ? `<div class="chips" style="margin:8px 0">${texts.map(t => `<label class="chip${t.tid === curTid ? ' on' : ''}" data-tid="${esc(t.tid)}">${esc(t.title)}</label>`).join('')}</div>` : ''}
    ${cur ? `<p class="small muted" style="margin:6px 0">${esc(cur.title)}${cur.mine ? ' · 내가 넣거나 고친 본문' : ''}</p>
      <div class="src-text${lnOn ? ' ln' : ''}" id="srcText">${cur.body.split('\n').map(line => line.trim() ? `<div class="l">${esc(line)}</div>` : '<div class="l e"></div>').join('')}</div>`
      : `<p class="small muted">아직 본문이 없다. "+ 붙여넣기" 로 원문을 넣거나 "+ 사진" 으로 교과서 사진을 올린다. 공부 Claude 프롬프트로 받은 자료에는 본문이 같이 들어 있다.</p>`}
    <div id="srcImgs" class="src-imgs"></div>
  </section>`;

  main.innerHTML = `
  <p class="small"><a href="#/study?s=${p.subject}">← ${subjName(p.subject)}</a></p>
  <h1>${esc(p.title)}</h1>
  <div class="row small muted" style="margin-bottom:10px">${subjDot(p.subject)} ${subjName(p.subject)}${p.unit ? ' · ' + esc(p.unit) : ''}${p.updated ? ' · ' + esc(String(p.updated).slice(0, 10)) : ''}${p._src === 'local' ? ' <span class="tag vio">내 기기에 가져온 자료</span>' : ''}</div>
  ${p.summary ? `<p class="note info">${esc(p.summary)}</p>` : ''}
  <div class="row noprint" style="margin:12px 0">
    ${qs.length ? `<a class="btn pri" href="#/run?pack=${encodeURIComponent(p.id)}">문제 ${qs.length}개 풀기</a>` : ''}
    ${(p.cards || []).length ? `<a class="btn" href="#/flash?pack=${encodeURIComponent(p.id)}">암기카드 ${p.cards.length}장</a>` : ''}
    ${p.notes ? `<a class="btn" href="#/blank?pack=${encodeURIComponent(p.id)}" title="자료를 안 보고 기억나는 것을 다 써 본 뒤 비교한다">백지 복습</a>` : ''}
    <a class="btn" href="#/gen?pack=${encodeURIComponent(p.id)}">AI 문제 더 만들기</a>
    <button class="btn${srcOn ? ' pri' : ''}" id="srcBtn">${srcOn ? '본문 닫기' : '본문 같이 보기'}${texts.length ? ` (${texts.length})` : ''}</button>
    <button class="btn ghost" id="readBtn">${read[p.id] ? '다 읽음 ✓' : '다 읽음 표시'}</button>
    <button class="btn ghost" id="printBtn">인쇄</button>
  </div>
  <p class="small muted">읽은 시간 <b id="readNow">${S.fmtDur(S.readTimeOf(p.id))}</b> (${readEvents.length}번)${readEvents.length ? ` · 마지막 ${S.fmtDate(S.ymd(new Date(readEvents[readEvents.length - 1].t)))}` : ''}${qs.length ? ` · 객관식 ${cnt('mcq')} · 단답형 ${cnt('short')} · 서술형 ${cnt('essay')} · 푼 문제 ${tried}/${qs.length} · 정답률 ${n ? pct(ok, n) + '%' : '-'}` : ''}</p>
  ${pos && pos.r > 0.05 && !hl ? `<p class="noprint"><button class="btn sm" id="resumeBtn">지난번 읽던 곳으로 (${Math.round(pos.r * 100)}%)</button></p>` : ''}
  <div class="pack-layout${srcOn ? ' src-on' : ''}">${srcOn ? srcPane : ''}<div class="pack-main">
  <p class="small muted noprint" style="margin:0 0 6px">글자를 길게 눌러 고르면 형광펜·메모를 남길 수 있다${srcOn ? ' (본문에도 된다)' : ''}.</p>
  <article class="card notes" id="notes">${p.notes ? md(p.notes) : '<p class="muted">본문이 없는 자료다.</p>'}</article>
  ${(p.cards || []).length ? `<details class="card flat"><summary>암기 항목 ${p.cards.length}개 한눈에 보기</summary><table class="crit">${p.cards.map(c => `<tr><td><b>${esc(c.front)}</b></td><td>${esc(c.back)}</td></tr>`).join('')}</table></details>` : ''}
  </div>
  <aside class="pack-side">
  <section class="card noprint">
    <h2>내 단원 메모</h2>
    <textarea id="pnote" placeholder="이 단원에서 기억할 것, 선생님이 강조한 것, 헷갈리는 것" style="min-height:90px">${esc(memo?.text || '')}</textarea>
    <p class="small muted" id="pnoteInfo">${memo ? '저장됨 · ' + S.fmtDate(S.ymd(new Date(memo.u))) + ' ' + S.fmtTime(memo.u) : '쓰면 바로 저장된다.'}</p>
  </section>
  <section class="card noprint">
    <div class="row between"><h2 style="margin:0">형광펜·메모 ${marks.length}</h2><a class="small" href="#/marks?pack=${encodeURIComponent(p.id)}">모아보기</a></div>
    <ul class="list" id="markList">${marks.map(h => `<li><a class="item" href="#" data-goto="${h.id}"><span class="hl-sw hl-${h.color}"></span><span class="grow small">${h.where ? '<span class="tag">본문</span> ' : ''}${esc(h.text.slice(0, 60))}${h.text.length > 60 ? '…' : ''}${h.note ? `<br><span class="muted">✎ ${esc(h.note)}</span>` : ''}</span></a></li>`).join('') || '<li class="item small muted">아직 없다.</li>'}</ul>
  </section>
  <section class="card noprint">
    <h2>이 자료에 대해 묻기</h2>
    ${AI.hasKey() ? '' : '<p class="small muted">API 키가 없으면 "채팅으로 묻기" 를 누른다. 자료 본문과 질문이 같이 복사되니 claude.ai 나 공부 Claude 채팅에 붙여넣는다.</p>'}
    <div id="chat">${hist.map(h => `<p><b>나:</b> ${esc(h.q)}</p><div class="notes" style="margin-bottom:12px">${md(h.a)}</div>`).join('')}</div>
    <form id="askf"><textarea name="q" rows="3" placeholder="예: 이 시에서 화자의 태도가 바뀌는 부분이 어디야?" style="min-height:80px"></textarea>
    <pre class="prompt" id="askPre" hidden></pre>
    <div class="row" style="margin-top:8px">${AI.hasKey() ? '<button class="btn pri">묻기</button>' : '<button type="button" class="btn pri" id="askCopy">채팅으로 묻기 (복사)</button> <a class="btn ghost" href="https://claude.ai/new" target="_blank" rel="noopener">claude.ai 열기</a>'}${hist.length ? '<button type="button" class="btn ghost sm" id="clearChat">대화 지우기</button>' : ''}</div></form>
  </section></aside></div>
  `;
  const notes = $('#notes');
  const srcText = $('#srcText');
  const missing = [...HL.paint(notes, notesMarks), ...(srcText ? HL.paint(srcText, srcMarks) : [])];
  missing.forEach(id => { const li = $(`[data-goto="${id}"]`); if (li) li.insertAdjacentHTML('beforeend', '<span class="tag warn">본문 바뀜</span>'); });
  if (hl) highlight(notes, hl);
  else if (q.get('mark')) setTimeout(() => main.querySelector(`[data-hl="${q.get('mark')}"]`)?.scrollIntoView({ block: 'center' }), 60);
  else if (q.get('resume') && pos) setTimeout(() => scrollToRatio(notes, pos.r), 60);

  reader.start(p.id);
  onLeave = () => {
    savePos();
    const nq = params();
    if (nq.path !== '/pack' || nq.q.get('id') !== p.id) reader.stop();
  };

  // 형광펜 고르기
  bindSelection([{ root: notes, where: null }, ...(srcText ? [{ root: srcText, where: 'src:' + cur.tid }] : [])], p);
  [notes, srcText].filter(Boolean).forEach(root => root.addEventListener('click', e => {
    const m = e.target.closest('mark.hl');
    if (m && !window.getSelection().toString()) openMarkDialog(m.dataset.hl);
  }));
  $$('[data-goto]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const h = S.kvGet('hl', a.dataset.goto);
    const m = main.querySelector(`[data-hl="${a.dataset.goto}"]`);
    if (m) { m.scrollIntoView({ block: 'center' }); m.classList.add('flash-hl'); setTimeout(() => m.classList.remove('flash-hl'), 1200); }
    else if (h && h.where && (!srcOn || h.where !== 'src:' + cur?.tid)) location.hash = `#/pack?id=${encodeURIComponent(p.id)}&src=${encodeURIComponent(h.where.slice(4))}&mark=${h.id}`;
    else openMarkDialog(a.dataset.goto);
  }));

  // 본문 같이 보기
  $('#srcBtn').addEventListener('click', () => { S.save('srcOn', !srcOn); render.keepScroll = true; render(); });
  if (srcOn) bindSrcPane(p, texts, cur);
  $('#resumeBtn')?.addEventListener('click', () => scrollToRatio(notes, pos.r));

  // 단원 메모
  let memoT = null;
  $('#pnote').addEventListener('input', e => {
    clearTimeout(memoT);
    $('#pnoteInfo').textContent = '쓰는 중…';
    memoT = setTimeout(() => {
      const v = e.target.value;
      if (v.trim()) S.kvSet('pnote', p.id, { text: v, pack: p.id });
      else S.kvDel('pnote', p.id);
      $('#pnoteInfo').textContent = '저장됨 · ' + S.fmtTime(Date.now());
    }, 800);
  });

  $('#readBtn').addEventListener('click', () => {
    if (readMarks()[p.id]) S.kvDel('readmark', p.id); else S.kvSet('readmark', p.id, { date: S.today() });
    render.keepScroll = true; render();
  });
  $('#printBtn').addEventListener('click', () => window.print());
  $('#clearChat')?.addEventListener('click', () => { chatHistory[p.id] = []; render.keepScroll = true; render(); });
  $('#askCopy')?.addEventListener('click', () => {
    const text = $('#askf').q.value.trim();
    if (!text) return toast('질문을 먼저 쓴다.');
    S.recordAsk(p.id, text);
    copyText(AI.askChatPrompt(p, text), $('#askPre'));
  });
  $('#askf').addEventListener('submit', async e => {
    e.preventDefault();
    if (!AI.hasKey()) return;
    const text = e.target.q.value.trim();
    if (!text) return;
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> 생각 중';
    try {
      const a = await AI.askAboutPack(p, text, chatHistory[p.id] || []);
      chatHistory[p.id] = [...(chatHistory[p.id] || []), { q: text, a }];
      S.recordAsk(p.id, text);
      render.keepScroll = true; render();
    } catch (err) {
      toast(err.message, 4000);
      btn.disabled = false; btn.textContent = '묻기';
    }
  });
}

function scrollToRatio(el, r) {
  const top = el.getBoundingClientRect().top + window.scrollY + el.offsetHeight * r - 100;
  window.scrollTo({ top: Math.max(0, top) });
}

// ---------- 본문 칸 ----------
let srcUrls = [];
function bindSrcPane(p, texts, cur) {
  $$('#srcPane [data-tid]').forEach(c => c.addEventListener('click', () => {
    const tabs = S.load('srcTab', {}); tabs[p.id] = c.dataset.tid; S.save('srcTab', tabs);
    location.hash = `#/pack?id=${encodeURIComponent(p.id)}&src=${encodeURIComponent(c.dataset.tid)}`;
  }));
  $('#lnOn')?.addEventListener('change', e => { S.save('srcLn', e.target.checked); $('#srcText').classList.toggle('ln', e.target.checked); });
  $('#srcAdd').addEventListener('click', () => openSrcDialog(p, null));
  $('#srcEdit')?.addEventListener('click', () => openSrcDialog(p, cur));
  $('#srcImg').addEventListener('change', async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    toast('사진을 줄여서 저장하는 중…');
    try { for (const f of files) await SRC.addImage(p.id, f); toast(`사진 ${files.length}장을 넣었다. 이 기기에만 저장된다.`); }
    catch (err) { toast('사진을 저장하지 못했다: ' + err.message, 4000); }
    drawImgs();
  });
  const drawImgs = async () => {
    srcUrls.forEach(u => URL.revokeObjectURL(u)); srcUrls = [];
    const list = await SRC.listImages(p.id);
    const box = document.getElementById('srcImgs');
    if (!box) return;
    box.innerHTML = list.map(im => { const u = URL.createObjectURL(im.blob); srcUrls.push(u); return `<figure><a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="교과서 사진" loading="lazy"></a><button class="btn sm ghost bad" data-imgdel="${im.id}">사진 지우기</button></figure>`; }).join('');
    box.querySelectorAll('[data-imgdel]').forEach(b => b.addEventListener('click', async () => { if (!confirm('이 사진을 지울까?')) return; await SRC.deleteImage(b.dataset.imgdel); drawImgs(); }));
  };
  drawImgs();
}

function openSrcDialog(p, t) {
  let dlg = document.getElementById('srcDlg');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'srcDlg'; dlg.className = 'dlg wide'; document.body.appendChild(dlg); }
  dlg.innerHTML = `<form method="dialog">
    <h2 style="margin-top:0">${t ? '본문 고치기' : '본문 붙여넣기'}</h2>
    <label class="field"><span>제목 (작품 이름, 지문 제목)</span><input type="text" name="title" value="${esc(t?.title || '')}" placeholder="예: 진달래꽃 - 김소월"></label>
    <label class="field"><span>본문 (줄바꿈 그대로 붙여넣는다)</span><textarea name="body" style="min-height:45vh;font-size:.95rem">${esc(t?.body || '')}</textarea></label>
    <div class="row between"><span>${t ? (t.fromPack && t.mine ? '<button value="revert" class="btn sm ghost">자료 원래 본문으로</button>' : '<button value="del" class="btn sm bad">이 본문 지우기</button>') : ''}</span><span class="row"><button value="cancel" class="btn sm ghost">닫기</button><button value="save" class="btn sm pri">저장</button></span></div>
  </form>`;
  dlg.onclose = () => {
    const v = dlg.returnValue, f = dlg.querySelector('form');
    if (v === 'save') {
      const body = f.body.value.replace(/\r\n/g, '\n');
      if (!body.trim()) return toast('본문이 비어 있다.');
      const tid = SRC.saveText(p, t?.tid, f.title.value.trim() || '본문', body);
      const tabs = S.load('srcTab', {}); tabs[p.id] = tid; S.save('srcTab', tabs);
      S.save('srcOn', true);
    } else if (v === 'del') { if (!confirm('이 본문을 지울까? 여기에 칠한 형광펜은 목록에만 남는다.')) return; SRC.deleteText(p, t); }
    else if (v === 'revert') SRC.revertText(p, t);
    else return;
    location.hash = `#/pack?id=${encodeURIComponent(p.id)}`;
    render.keepScroll = true; render();
  };
  dlg.showModal();
}

// ---------- 형광펜: 고르면 아래에 도구 띠가 뜬다 ----------
let selBar = null;
function hideSelBar() { if (selBar) selBar.style.display = 'none'; }
function bindSelection(roots, pack) {
  if (!selBar) {
    selBar = document.createElement('div');
    selBar.className = 'selbar noprint';
    selBar.innerHTML = `${HL.COLORS.map(c => `<button type="button" data-c="${c.id}" class="hl-btn hl-${c.id}" aria-label="${c.name} 형광펜">${c.name}</button>`).join('')}<button type="button" data-memo class="btn sm">메모</button><button type="button" data-x class="btn sm ghost" aria-label="닫기">✕</button>`;
    document.body.appendChild(selBar);
    // 버튼을 눌러도 선택이 풀리지 않게
    selBar.addEventListener('pointerdown', e => e.preventDefault());
    selBar.addEventListener('mousedown', e => e.preventDefault());
  }
  let anchor = null, where = null;
  const find = () => {
    for (const r of roots) {
      if (!document.body.contains(r.root)) continue;
      const a = HL.selectionAnchor(r.root);
      if (a) return { a, where: r.where };
    }
    return null;
  };
  const onSel = () => {
    const f = find();
    if (f) { anchor = f.a; where = f.where; selBar.style.display = 'flex'; }
    else if (!selBar.contains(document.activeElement)) { selBar.style.display = 'none'; }
  };
  document.onselectionchange = onSel;
  selBar.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-x')) { window.getSelection().removeAllRanges(); hideSelBar(); return; }
    const f = anchor ? { a: anchor, where } : find();
    if (!f) return hideSelBar();
    const a = f.a;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const color = b.dataset.c || 'y';
    S.kvSet('hl', id, { id, pack: pack.id, subject: pack.subject, text: a.text, prefix: a.prefix, suffix: a.suffix, color, note: '', c: Date.now(), ...(f.where ? { where: f.where } : {}) });
    window.getSelection().removeAllRanges();
    hideSelBar();
    render.keepScroll = true; render();
    if (b.hasAttribute('data-memo')) setTimeout(() => openMarkDialog(id), 50);
  };
}

// 형광펜 하나를 눌렀을 때: 색 바꾸기, 메모, 지우기
function openMarkDialog(id) {
  const h = S.kvGet('hl', id);
  if (!h) return;
  let dlg = document.getElementById('markDlg');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'markDlg'; dlg.className = 'dlg'; document.body.appendChild(dlg); }
  dlg.innerHTML = `<form method="dialog">
    <p class="small muted" style="margin:0">${subjName(h.subject)} · ${esc(D.db().byId[h.pack]?.title || '')} · ${S.fmtDate(S.ymd(new Date(h.c)))}</p>
    <blockquote class="hl-quote hl-${h.color}">${esc(h.text)}</blockquote>
    <div class="chips" style="margin:8px 0">${HL.COLORS.map(c => `<label class="chip"><input type="radio" name="color" value="${c.id}"${c.id === h.color ? ' checked' : ''}><span class="hl-sw hl-${c.id}"></span>${c.name}</label>`).join('')}</div>
    <textarea name="note" placeholder="메모" style="min-height:90px">${esc(h.note || '')}</textarea>
    <div class="row between" style="margin-top:10px"><button value="del" class="btn sm bad">지우기</button><span class="row"><button value="cancel" class="btn sm ghost">닫기</button><button value="save" class="btn sm pri">저장</button></span></div>
  </form>`;
  dlg.onclose = () => {
    const v = dlg.returnValue;
    const f = dlg.querySelector('form');
    if (v === 'save') { const { u, ...rest } = h; S.kvSet('hl', id, { ...rest, color: f.color.value, note: f.note.value.trim() }); }
    else if (v === 'del') { if (!confirm('이 형광펜과 메모를 지울까?')) return; S.kvDel('hl', id); }
    else return;
    render.keepScroll = true; render();
  };
  dlg.showModal();
}

function highlight(root, term) {
  const low = term.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (walker.currentNode.nodeValue.toLowerCase().includes(low)) nodes.push(walker.currentNode);
  let first = null;
  for (const node of nodes) {
    const v = node.nodeValue, i = v.toLowerCase().indexOf(low);
    const mark = document.createElement('mark');
    mark.textContent = v.slice(i, i + term.length);
    const after = node.splitText(i);
    after.nodeValue = after.nodeValue.slice(term.length);
    node.parentNode.insertBefore(mark, after);
    first = first || mark;
  }
  if (first) setTimeout(() => first.scrollIntoView({ block: 'center' }), 50);
}

// ================= 문제 고르기 =================
function viewQuizSetup() {
  const last = S.load('quizPrefs', { subject: [], packs: [], types: ['mcq', 'short', 'essay'], src: 'all', count: '10', mode: 'practice', minutes: '30', order: 'shuffle' });
  const packs = D.db().packs.filter(p => (p.questions || []).length);
  if (!packs.length) {
    main.innerHTML = `<h1>문제 풀기</h1><p class="muted">문제가 들어 있는 자료가 아직 없다. <a href="#/settings">자료 가져오기</a></p>`;
    return;
  }
  main.innerHTML = `
  <h1>문제 풀기</h1>
  <form id="qf" class="card">
    <h3>과목</h3>${chipGroup('subject', SUBJECTS.filter(s => packs.some(p => p.subject === s.id)).map(s => ({ value: s.id, label: s.name, dot: true })), last.subject)}
    <p class="small muted">아무것도 안 고르면 전체.</p>
    <h3 style="margin-top:14px">단원</h3><div id="packChips"></div>
    <h3 style="margin-top:14px">유형</h3>${chipGroup('types', Object.entries(TYPE_NAME).map(([v, l]) => ({ value: v, label: l })), last.types)}
    <h3 style="margin-top:14px">어떤 문제</h3>${chipGroup('src', [
      { value: 'all', label: '전체' }, { value: 'new', label: '안 푼 문제' }, { value: 'wrong', label: '오답만' },
      { value: 'due', label: '복습할 때 된 문제' }, { value: 'star', label: '헷갈림 표시' }], [last.src], false)}
    <div class="grid" style="margin-top:14px">
      <label class="field"><span>개수</span><select name="count">${['5', '10', '20', '30', 'all'].map(v => `<option value="${v}"${last.count === v ? ' selected' : ''}>${v === 'all' ? '전부' : v + '문제'}</option>`).join('')}</select></label>
      <label class="field"><span>순서</span><select name="order"><option value="shuffle"${last.order === 'shuffle' ? ' selected' : ''}>섞기</option><option value="seq"${last.order === 'seq' ? ' selected' : ''}>자료 순서대로</option></select></label>
      <label class="field"><span>방식</span><select name="mode"><option value="practice"${last.mode === 'practice' ? ' selected' : ''}>연습 (한 문제씩 바로 채점)</option><option value="exam"${last.mode === 'exam' ? ' selected' : ''}>실전 (시간 재고 끝에 채점)</option></select></label>
      <label class="field" id="minField"><span>제한 시간(분)</span><input type="number" name="minutes" min="1" max="180" value="${esc(last.minutes)}"></label>
    </div>
    <p id="qcount" class="small muted"></p>
    <button class="btn pri block" style="margin-top:6px">시작</button>
  </form>`;

  const drawPacks = () => {
    const subs = picked('subject');
    const list = packs.filter(p => !subs.length || subs.includes(p.subject));
    const keep = picked('packs');
    $('#packChips').innerHTML = chipGroup('packs', list.map(p => ({ value: p.id, label: p.title })), keep.length ? keep : last.packs) + '<p class="small muted">아무것도 안 고르면 고른 과목 전체.</p>';
    $$('input[name="packs"]').forEach(i => i.addEventListener('change', count));
    count();
  };
  const collect = () => {
    const f = $('#qf');
    return { subject: picked('subject'), packs: picked('packs'), types: picked('types'), src: picked('src')[0] || 'all', count: f.count.value, order: f.order.value, mode: f.mode.value, minutes: f.minutes.value };
  };
  const count = () => {
    const c = collect();
    const items = pickItems(c);
    $('#qcount').textContent = `조건에 맞는 문제 ${items.length}개`;
    $('#minField').style.display = c.mode === 'exam' ? '' : 'none';
  };
  $$('input[name="subject"]').forEach(i => i.addEventListener('change', drawPacks));
  $$('input[name="types"],input[name="src"]').forEach(i => i.addEventListener('change', count));
  $('#qf').mode.addEventListener('change', count);
  drawPacks();
  $('#qf').addEventListener('submit', e => {
    e.preventDefault();
    const c = collect();
    // 고른 과목에서 빠진 단원은 지운다
    const valid = new Set(packs.filter(p => !c.subject.length || c.subject.includes(p.subject)).map(p => p.id));
    c.packs = c.packs.filter(id => valid.has(id));
    S.save('quizPrefs', c);
    let items = pickItems(c);
    if (!items.length) return toast('조건에 맞는 문제가 없다.');
    if (c.order === 'shuffle') items = shuffle(items);
    if (c.count !== 'all') items = items.slice(0, Number(c.count));
    startSession(items, c.mode, Number(c.minutes) || 30);
  });
}

// 섞어 풀기 (인터리빙): 복습할 때 된 것·오답·안 푼 것을 과목을 번갈아 가며 섞는다
function mixItems(n = 20) {
  const prog = S.getProgress();
  const t = S.today();
  const pool = D.allQuestions().filter(x => { const r = prog[x.key]; return !r || !r.n || r.wrong || (r.due && r.due <= t); });
  const bySub = {};
  for (const x of shuffle(pool)) (bySub[x.pack.subject] = bySub[x.pack.subject] || []).push(x);
  const subs = shuffle(Object.keys(bySub));
  const out = [];
  while (out.length < n && subs.some(s => bySub[s].length)) for (const s of subs) if (bySub[s].length && out.length < n) out.push(bySub[s].shift());
  return out;
}

function pickItems(c) {
  const prog = S.getProgress();
  const t = S.today();
  let items = D.allQuestions({ subject: c.subject, packs: c.packs, types: c.types });
  if (c.src === 'new') items = items.filter(x => !prog[x.key]?.n);
  if (c.src === 'wrong') items = items.filter(x => prog[x.key]?.wrong);
  if (c.src === 'due') items = items.filter(x => { const r = prog[x.key]; return r && r.n && r.due && r.due <= t; });
  if (c.src === 'star') items = items.filter(x => prog[x.key]?.star);
  return items;
}

// ================= 문제 풀기 =================
let session = null;

function startSession(items, mode = 'practice', minutes = 30) {
  session = {
    items, mode, i: 0,
    answers: {}, results: {},
    endAt: mode === 'exam' ? Date.now() + minutes * 60000 : null,
    startedAt: Date.now(),
    submitted: false,
    id: 's' + Date.now().toString(36),
    spent: {}, cur: null,
  };
  const here = location.hash === '#/run';
  location.hash = '#/run';
  if (here) render();
}

function viewRun() {
  const { q } = params();
  // 홈이나 자료 화면에서 바로 들어온 경우
  if (q.get('src') || q.get('pack')) {
    let items;
    if (q.get('src') === 'due') items = shuffle(dueItems());
    else if (q.get('src') === 'wrong') items = shuffle(wrongItems());
    else items = D.allQuestions({ packs: [q.get('pack')] });
    if (!items.length) { main.innerHTML = '<p class="muted">풀 문제가 없다. <a href="#/">홈으로</a></p>'; return; }
    session = null;
    startSession(items, 'practice');
    return;
  }
  if (!session) { main.innerHTML = '<p class="muted">진행 중인 문제가 없다. <a href="#/quiz">문제 고르기</a></p>'; return; }
  if (session.viewing) return drawQuestion();
  if (session.mode === 'exam' && session.submitted) return viewSummary();
  if (session.mode !== 'exam' && session.i >= session.items.length) return viewSummary();
  drawQuestion();
}

function navButtons() {
  return `<div class="qnav">${session.items.map((it, i) => {
    const r = session.results[i];
    const cls = [i === session.i ? 'cur' : '', r ? r.result : (session.answers[i] != null && session.answers[i] !== '' && !(Array.isArray(session.answers[i]) && !session.answers[i].length) ? 'done' : '')].join(' ');
    return `<button type="button" data-go="${i}" class="${cls}">${i + 1}</button>`;
  }).join('')}</div>`;
}

// 지금 보고 있는 문제에 머문 시간을 더한다
function tickSpent() {
  if (!session) return;
  const now = Date.now();
  if (session.cur && document.visibilityState === 'visible') session.spent[session.cur.i] = (session.spent[session.cur.i] || 0) + Math.min(now - session.cur.since, 15 * 60000);
  session.cur = session.submitted || session.results[session.i] ? null : { i: session.i, since: now };
}

function drawQuestion() {
  tickSpent();
  const it = session.items[session.i];
  const { pack, q, key } = it;
  const pr = S.qp(key);
  const res = session.results[session.i];
  const ans = session.answers[session.i];
  const exam = session.mode === 'exam';
  const locked = !!res || (exam && session.submitted);

  let body = '';
  if (q.type === 'mcq') {
    const sel = Array.isArray(ans) ? ans : [];
    const right = Array.isArray(q.answer) ? q.answer : [q.answer];
    const multi = right.length > 1;
    body = `${multi ? '<p class="small muted">답이 여러 개다. 모두 고른다.</p>' : ''}<ul class="choices">${q.choices.map((c, i) => {
      const n = i + 1;
      let cls = sel.includes(n) ? 'sel' : '';
      if (res) cls = right.includes(n) ? 'right' : (sel.includes(n) ? 'wrong' : '');
      return `<li><button type="button" class="choice ${cls}" data-ch="${n}"${locked ? ' disabled' : ''}><span class="n">${'①②③④⑤⑥'[i] || n}</span><span>${esc(c)}</span></button></li>`;
    }).join('')}</ul>`;
  } else if (q.type === 'short') {
    body = `<input type="text" id="ansIn" placeholder="답을 쓴다" value="${esc(ans || '')}"${locked ? ' disabled' : ''} autocomplete="off" style="margin-top:12px">`;
  } else {
    const max = D.essayMax(q);
    body = `<p class="small muted" style="margin-top:10px">${max}점${q.limit ? ' · ' + esc(q.limit) : ''}</p><textarea id="ansIn" placeholder="답안을 쓴다"${locked ? ' disabled' : ''} style="min-height:180px">${esc(ans || '')}</textarea>
    <p class="small muted" id="lenInfo"></p>`;
  }

  const timer = exam ? `<span class="timer" id="timer"></span>` : '';
  main.innerHTML = `
  <div class="row between"><span class="small muted">${session.i + 1} / ${session.items.length}${exam ? ' · 실전' : ''}</span>${timer}<button class="btn sm ghost" id="quit">그만</button></div>
  ${navButtons()}
  <section class="card qcard${q.context ? ' has-ctx' : ''}">
    <div class="q-head">${subjDot(pack.subject)}<span class="small">${subjName(pack.subject)} · ${esc(pack.title)}</span><span class="tag">${TYPE_NAME[q.type]}</span>${q.difficulty ? `<span class="tag">${'★'.repeat(q.difficulty)}</span>` : ''}${pr?.n ? `<span class="tag ${pr.last === 'ok' ? 'ok' : pr.last === 'part' ? 'warn' : 'bad'}">전에 ${pr.ok}/${pr.n}</span>` : ''}</div>
    <div class="q-split">
    ${q.context ? `<div class="q-ctx">${esc(q.context)}</div>` : ''}
    <div class="q-main">
    <div class="q-text">${esc(q.question)}</div>
    ${body}
    <div id="resBox">${res ? resultHtml(it, res) : ''}</div>
    <div class="row" style="margin-top:14px" id="actions"></div>
    </div></div>
  </section>
  <div class="row"><label class="chip${pr?.star ? ' on' : ''}" id="starBtn">${pr?.star ? '★ 헷갈림 표시됨' : '☆ 헷갈림 표시'}</label>${q.source ? `<span class="small muted">출처: ${esc(q.source)}</span>` : ''}</div>
  `;

  // 답 입력
  $$('[data-ch]').forEach(b => b.addEventListener('click', () => {
    const n = Number(b.dataset.ch);
    const right = Array.isArray(q.answer) ? q.answer : [q.answer];
    let sel = Array.isArray(session.answers[session.i]) ? [...session.answers[session.i]] : [];
    if (right.length > 1) sel = sel.includes(n) ? sel.filter(x => x !== n) : [...sel, n];
    else sel = [n];
    session.answers[session.i] = sel;
    render.keepScroll = true; drawQuestion();
  }));
  const inp = $('#ansIn');
  if (inp) {
    const upd = () => { session.answers[session.i] = inp.value; const li = $('#lenInfo'); if (li) li.textContent = `${inp.value.replace(/\s/g, '').length}자 (공백 빼고)`; };
    inp.addEventListener('input', upd);
    upd();
    if (q.type === 'short') inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('#checkBtn')?.click(); } });
  }
  $$('[data-go]').forEach(b => b.addEventListener('click', () => { session.i = Number(b.dataset.go); drawQuestion(); }));
  $('#quit').addEventListener('click', () => {
    if (session.viewing) { toSummary(); return; }
    if (exam && !session.submitted) { if (!confirm('실전을 그만두면 쓴 답은 채점하지 않는다. 그만둘까?')) return; session = null; location.hash = '#/quiz'; return; }
    if (session.mode !== 'exam' && Object.keys(session.results).length) { session.viewing = false; session.i = session.items.length; render(); return; }
    session = null; location.hash = '#/quiz';
  });
  $('#starBtn').addEventListener('click', () => { S.setFlag(key, 'star', !(pr && pr.star)); render.keepScroll = true; drawQuestion(); });

  // 버튼
  const acts = $('#actions');
  const last = session.i === session.items.length - 1;
  if (exam && !session.submitted) {
    acts.innerHTML = `${session.i > 0 ? '<button class="btn" id="prev">이전</button>' : ''}${!last ? '<button class="btn pri" id="next">다음</button>' : ''}<button class="btn ${last ? 'pri' : 'ghost'}" id="submitAll">제출하고 채점</button>`;
  } else if (!res) {
    const cf = (session.conf || {})[session.i] || '';
    acts.innerHTML = `${q.type !== 'essay' ? `<div class="conf small" role="group" aria-label="확신도"><span class="muted">얼마나 확실해?</span>${[['sure', '확실'], ['unsure', '애매'], ['guess', '찍음']].map(([v, l]) => `<button type="button" class="chip${cf === v ? ' on' : ''}" data-conf="${v}">${l}</button>`).join('')}</div>` : ''}<button class="btn pri" id="checkBtn">채점</button><button class="btn ghost" id="skipBtn">모르겠다</button>`;
  } else {
    acts.innerHTML = `${session.viewing ? `<a class="btn" href="#/run" id="toSum">결과 목록</a>` : ''}<button class="btn pri" id="next">${last ? '결과 보기' : '다음'}</button>`;
  }
  $$('[data-conf]').forEach(b => b.addEventListener('click', () => {
    session.conf = session.conf || {};
    session.conf[session.i] = session.conf[session.i] === b.dataset.conf ? '' : b.dataset.conf;
    render.keepScroll = true; drawQuestion();
  }));
  $('#prev')?.addEventListener('click', () => { session.i--; drawQuestion(); });
  $('#next')?.addEventListener('click', () => {
    if (session.viewing) {
      if (last) toSummary(); else { session.i++; drawQuestion(); }
      return;
    }
    session.i++; render();
  });
  $('#toSum')?.addEventListener('click', e => { e.preventDefault(); toSummary(); });
  $('#submitAll')?.addEventListener('click', submitExam);
  $('#checkBtn')?.addEventListener('click', async () => {
    const a = session.answers[session.i];
    if (a == null || a === '' || (Array.isArray(a) && !a.length)) return toast('답을 먼저 쓴다. 모르면 "모르겠다".');
    await gradeOne(session.i, $('#checkBtn'));
    render.keepScroll = true; drawQuestion();
  });
  $('#skipBtn')?.addEventListener('click', () => {
    tickSpent();
    const r = { result: 'wrong', skipped: true };
    session.results[session.i] = r;
    S.recordAnswer(key, 'wrong', '', null, session.spent[session.i], { skip: true, sess: session.id });
    render.keepScroll = true; drawQuestion();
  });
  bindResult(session.i);
  if (exam && !session.submitted) tickTimer();
}

// 태블릿 키보드용: 숫자로 보기 고르기, Enter 로 채점·다음
document.addEventListener('keydown', e => {
  if (params().path !== '/run' || !session || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (['textarea', 'input', 'select', 'button', 'a', 'summary'].includes(tag)) return;
  if (/^[1-6]$/.test(e.key)) { const b = main.querySelector(`[data-ch="${e.key}"]:not([disabled])`); if (b) { e.preventDefault(); b.click(); } }
  else if (e.key === 'Enter') { const b = $('#checkBtn') || $('#next'); if (b) { e.preventDefault(); b.click(); } }
  else if (e.key === 'ArrowRight' && session.mode === 'exam' && !session.submitted) $('#next')?.click();
  else if (e.key === 'ArrowLeft' && session.mode === 'exam' && !session.submitted) $('#prev')?.click();
});

function toSummary() {
  session.viewing = false;
  if (session.mode !== 'exam') session.i = session.items.length;
  render();
}

function tickTimer() {
  clearInterval(tickTimer._t);
  const upd = () => {
    const el = document.getElementById('timer');
    if (!session || !session.endAt || session.submitted) return clearInterval(tickTimer._t);
    const left = Math.max(0, session.endAt - Date.now());
    if (el) {
      const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
      el.textContent = `${m}:${String(s).padStart(2, '0')}`;
      el.classList.toggle('low', left < 5 * 60000);
    }
    if (left <= 0) { clearInterval(tickTimer._t); toast('시간이 끝났다. 채점한다.'); submitExam(); }
  };
  upd();
  tickTimer._t = setInterval(upd, 1000);
}

const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s.,·・、。'"‘’“”()\[\]{}~!?\-_/]/g, '');

// i 번째 문제 채점. 결과를 session.results 에 넣고 기록한다.
async function gradeOne(i, btn) {
  if (i === session.i) tickSpent();
  const it = session.items[i];
  const { pack, q, key } = it;
  const a = session.answers[i];
  let r;
  const empty = a == null || a === '' || (Array.isArray(a) && !a.length);
  if (q.type === 'mcq') {
    const right = (Array.isArray(q.answer) ? q.answer : [q.answer]).slice().sort().join(',');
    const sel = (Array.isArray(a) ? a : []).slice().sort().join(',');
    r = { result: sel === right ? 'ok' : 'wrong' };
  } else if (q.type === 'short') {
    if (empty) r = { result: 'wrong' };
    else if (q.answers.some(x => norm(x) === norm(a))) r = { result: 'ok' };
    else if (AI.hasKey()) {
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> AI 가 확인 중'; }
      try {
        const j = await AI.judgeShort(pack, q, a);
        r = { result: j.verdict === 'correct' ? 'ok' : j.verdict === 'partial' ? 'part' : 'wrong', ai: j.reason };
      } catch (err) {
        toast(err.message, 4000);
        r = { result: 'wrong', aiError: err.message };
      }
    } else r = { result: 'wrong', canOverride: true };
  } else {
    if (empty) r = { result: 'wrong', fb: { kind: 'essay', score: 0, max: D.essayMax(q), criteria: [], good: '', missing: '답을 쓰지 않았다.', improved: '' } };
    else if (AI.hasKey()) {
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> AI 가 채점 중'; }
      try {
        const fb = await AI.gradeEssay(pack, q, a);
        const ratio = fb.max ? fb.score / fb.max : 0;
        r = { result: ratio >= 0.8 ? 'ok' : ratio >= 0.4 ? 'part' : 'wrong', fb };
      } catch (err) {
        toast(err.message, 4500);
        r = { result: null, selfGrade: true, aiError: err.message };
      }
    } else r = { result: null, selfGrade: true };
  }
  // 메타인지: 찍어서 맞힌 문제는 아는 것으로 치지 않는다 (복습에 다시 나온다). 애매하게 맞힌 것은 헷갈림 표시.
  const conf = session.mode !== 'exam' ? (session.conf || {})[i] || '' : '';
  if (r.result === 'ok' && conf === 'guess') { r.result = 'part'; r.guessed = true; }
  session.results[i] = r;
  if (r.result) S.recordAnswer(key, r.result, a, r.fb || (r.ai ? { kind: 'short', reason: r.ai } : null), session.spent[i], { sess: session.id, exam: session.mode === 'exam' || undefined, conf: conf || undefined, guessed: r.guessed || undefined });
  if (r.result === 'ok' && conf === 'unsure' && !S.qp(key)?.star) S.setFlag(key, 'star', true);
  if (r.result && r.result !== 'ok' && conf === 'sure') r.overconf = true;
  return r;
}

function resultHtml(it, r) {
  const { q } = it;
  const a = session ? session.answers[session.items.indexOf(it)] : '';
  const title = r.guessed ? '맞았지만 찍었다' : ({ ok: '맞았다', part: '부분 점수', wrong: r.skipped ? '모르는 문제로 넘김' : '틀렸다' }[r.result] || '스스로 채점');
  let h = `<div class="result ${r.result || ''}"><h3>${title}</h3>`;
  if (r.guessed) h += '<p class="small">찍어서 맞힌 문제는 아는 것으로 치지 않는다. 오답노트에 넣고 복습에 다시 나온다.</p>';
  if (r.overconf) h += '<p class="small"><b>확실하다고 했는데 틀렸다.</b> 잘못 알고 있는 개념이다. 해설을 꼼꼼히 읽고 오답 원인을 적어 둔다.</p>';
  if (q.type === 'mcq') {
    const right = Array.isArray(q.answer) ? q.answer : [q.answer];
    h += `<p>정답: ${right.map(n => '①②③④⑤⑥'[n - 1] || n).join(', ')}</p>`;
  }
  if (q.type === 'short') {
    h += `<p>정답: <b>${q.answers.map(esc).join(' / ')}</b></p>`;
    if (r.ai) h += `<p class="small">AI: ${esc(r.ai)}</p>`;
    if (r.aiError) h += `<p class="small">AI 확인 실패: ${esc(r.aiError)}</p>`;
    if (r.result !== 'ok' && !r.skipped) {
      h += `<button class="btn sm" data-override>내 답도 맞다 (맞음으로 고치기)</button>`;
      if (!r.ai && !r.chatDone) h += `<details style="margin-top:8px"><summary>Claude 채팅으로 확인 (무료)</summary>${chatBox('같은 뜻인지 확인 요청 복사')}</details>`;
    }
  }
  if (q.type === 'essay') {
    if (r.fb && r.fb.criteria) {
      h += `<p class="mono" style="font-size:1.2rem;margin:4px 0"><b>${r.fb.score}</b> / ${r.fb.max}점</p>`;
      if (r.fb.criteria.length) h += `<table class="crit">${r.fb.criteria.map(c => `<tr><td>${esc(c.criterion)}<br><span class="small muted">${esc(c.comment)}</span></td><td class="pt">${c.earned}/${c.max}</td></tr>`).join('')}</table>`;
      if (r.fb.good) h += `<p><b>맞게 쓴 것</b> ${esc(r.fb.good)}</p>`;
      if (r.fb.missing) h += `<p><b>빠지거나 틀린 것</b> ${esc(r.fb.missing)}</p>`;
      if (r.fb.improved) h += `<details><summary>내 답을 고친 만점 답안</summary><p style="white-space:pre-wrap">${esc(r.fb.improved)}</p></details>`;
    }
    if (r.fb?.via === 'chat') h += `<p class="small muted">Claude 채팅으로 채점함</p>`;
    if (r.selfGrade) {
      h += `${r.aiError ? `<p class="small">AI 채점 실패: ${esc(r.aiError)}</p>` : ''}
      <div class="chatgrade"><h3 style="margin:0 0 4px">Claude 채팅으로 채점 (무료)</h3>${chatBox('채점 요청 복사')}</div>
      <details style="margin-top:10px"><summary>또는 스스로 채점</summary><p class="small">모범 답안을 보고 맞힌 기준을 고른다.</p>
      <form id="selfForm">${q.rubric.map((c, i) => `<label class="item" style="display:flex;gap:8px;padding:6px 0"><input type="checkbox" name="c" value="${i}"><span class="grow">${esc(c.criterion)}</span><span class="mono small">${c.points}점</span></label>`).join('')}
      <div class="row" style="margin-top:6px"><button class="btn sm pri">이만큼 맞혔다</button>${AI.hasKey() ? '<button type="button" class="btn sm" id="retryAi">AI 채점 다시</button>' : ''}</div></form></details>`;
    }
    h += `<details${r.selfGrade ? ' open' : ''}><summary>모범 답안</summary><p style="white-space:pre-wrap">${esc(q.model_answer)}</p></details>`;
    if (!r.selfGrade) h += `<details><summary>채점 기준</summary><ul>${q.rubric.map(c => `<li>${esc(c.criterion)} (${c.points}점)</li>`).join('')}</ul></details>`;
  }
  if (q.explanation) h += `<p style="margin-top:8px"><b>해설</b> ${esc(q.explanation)}</p>`;
  if (q.type !== 'mcq' && a && session.mode === 'exam') h += `<details><summary>내가 쓴 답</summary><p style="white-space:pre-wrap">${esc(a)}</p></details>`;
  const past = S.attemptsOf(it.key);
  if (past.length > 1) h += `<details><summary>지금까지 ${past.length}번 풀었다 · 풀이 이력</summary>${attemptList(it, past.slice(0, -1).reverse().slice(0, 8))}<a class="small" href="#/q?key=${encodeURIComponent(it.key)}">전체 이력</a></details>`;
  h += '</div>';
  return h;
}

// API 키 없이 claude.ai 채팅으로 채점: 요청 복사 → 채팅에 붙여넣기 → 답 붙여넣기
function chatBox(copyLabel) {
  return `<ol class="small" style="padding-left:1.2em;margin:6px 0">
    <li><button type="button" class="btn sm pri" data-cg-copy>${copyLabel}</button> <a class="btn sm ghost" href="https://claude.ai/new" target="_blank" rel="noopener">claude.ai 열기</a><br><span class="muted">claude.ai 무료 계정이나 그 과목 공부 Claude 채팅 어디든 된다.</span></li>
    <li>Claude 채팅에 붙여넣고 보낸다.</li>
    <li>Claude 가 준 코드 블록을 복사해서 아래에 붙여넣는다.</li>
  </ol>
  <pre class="prompt" data-cg-text hidden></pre>
  <textarea data-cg-in placeholder='Claude 의 답을 여기에 붙여넣기 ({"criteria": ... } 또는 {"verdict": ... })' style="min-height:80px;font-family:var(--mono);font-size:.82rem"></textarea>
  <button type="button" class="btn sm pri" data-cg-apply style="margin-top:6px">채점 결과 넣기</button>`;
}
async function copyText(text, pre) {
  try { await navigator.clipboard.writeText(text); toast('복사했다. Claude 채팅에 붙여넣는다.'); return; }
  catch (e) {}
  if (pre) {
    pre.textContent = text; pre.hidden = false;
    const r = document.createRange(); r.selectNodeContents(pre);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    toast('자동 복사가 막혔다. 선택된 글을 길게 눌러 복사한다.', 4000);
  }
}

const RES = { ok: ['ok', '맞음'], part: ['warn', '부분'], wrong: ['bad', '틀림'] };
function ansText(q, ans) {
  if (q.type === 'mcq') return (Array.isArray(ans) ? ans : []).map(n => '①②③④⑤⑥'[n - 1] || n).join(', ') || '(안 고름)';
  return ans ? String(ans) : '(안 씀)';
}
// 문제 하나의 풀이 이력 목록
function attemptList(it, list) {
  return `<ul class="list attempts">${list.map(e => {
    const [cls, word] = RES[e.r] || ['', e.r];
    return `<li class="item" style="align-items:flex-start"><span class="small mono muted" style="min-width:7.5em">${S.ymd(new Date(e.t)).slice(5).replace('-', '/')} ${S.fmtTime(e.t)}</span>
      <span class="grow small"><span style="white-space:pre-wrap">${esc(e.skip ? '(모르겠다)' : ansText(it.q, e.ans).slice(0, 400))}</span>${e.fb?.missing ? `<br><span class="muted">AI: ${esc(e.fb.missing)}</span>` : ''}${e.fb?.reason ? `<br><span class="muted">AI: ${esc(e.fb.reason)}</span>` : ''}</span>
      <span class="tag ${cls}">${word}${e.fb?.max ? ` ${e.fb.score}/${e.fb.max}` : ''}${e.overridden ? ' (고침)' : ''}</span></li>`;
  }).join('')}</ul>`;
}

function bindResult(i) {
  const it = session.items[i];
  const r = session.results[i];
  if (!r) return;
  $('[data-override]')?.addEventListener('click', () => {
    S.overrideOk(it.key);
    session.results[i] = { ...r, result: 'ok', overridden: true };
    toast('맞음으로 고쳤다.');
    render.keepScroll = true; drawQuestion();
  });
  $('#selfForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const got = $$('#selfForm input[name="c"]:checked').map(x => Number(x.value));
    const max = D.essayMax(it.q);
    const score = got.reduce((s, k) => s + it.q.rubric[k].points, 0);
    const ratio = max ? score / max : 0;
    const result = ratio >= 0.8 ? 'ok' : ratio >= 0.4 ? 'part' : 'wrong';
    const fb = { kind: 'essay', self: true, score, max, criteria: it.q.rubric.map((c, k) => ({ criterion: c.criterion, max: c.points, earned: got.includes(k) ? c.points : 0, comment: '' })), good: '', missing: '', improved: '' };
    session.results[i] = { result, fb };
    S.recordAnswer(it.key, result, session.answers[i], fb, session.spent[i], { sess: session.id, exam: session.mode === 'exam' || undefined });
    render.keepScroll = true; drawQuestion();
  });
  // Claude 채팅으로 채점
  $('[data-cg-copy]')?.addEventListener('click', () => {
    const a = session.answers[i];
    const text = it.q.type === 'essay' ? AI.essayChatPrompt(it.pack, it.q, a) : AI.shortChatPrompt(it.pack, it.q, a);
    copyText(text, $('[data-cg-text]'));
  });
  $('[data-cg-apply]')?.addEventListener('click', () => {
    const text = $('[data-cg-in]').value;
    if (!text.trim()) return toast('Claude 의 답을 먼저 붙여넣는다.');
    try {
      if (it.q.type === 'essay') {
        const fb = { ...AI.parseEssayReply(it.q, text), via: 'chat' };
        const ratio = fb.max ? fb.score / fb.max : 0;
        const result = ratio >= 0.8 ? 'ok' : ratio >= 0.4 ? 'part' : 'wrong';
        session.results[i] = { result, fb };
        S.recordAnswer(it.key, result, session.answers[i], fb, session.spent[i], { sess: session.id, exam: session.mode === 'exam' || undefined });
      } else {
        const j = AI.parseShortReply(text);
        if (j.verdict === 'correct') S.overrideOk(it.key);
        session.results[i] = { ...r, result: j.verdict === 'correct' ? 'ok' : r.result, ai: j.reason + (j.verdict === 'partial' ? ' (부분 정답)' : ''), chatDone: true, overridden: j.verdict === 'correct' };
      }
      toast('채점 결과를 넣었다.');
      render.keepScroll = true; drawQuestion();
    } catch (err) { toast(err.message, 5000); }
  });
  $('#retryAi')?.addEventListener('click', async e => {
    delete session.results[i];
    await gradeOne(i, e.target);
    render.keepScroll = true; drawQuestion();
  });
}

async function submitExam() {
  if (!session || session.submitted) return;
  const unanswered = session.items.filter((_, i) => { const a = session.answers[i]; return a == null || a === '' || (Array.isArray(a) && !a.length); }).length;
  if (session.endAt > Date.now() && unanswered && !confirm(`안 쓴 문제가 ${unanswered}개 있다. 제출할까?`)) return;
  tickSpent();
  session.submitted = true;
  clearInterval(tickTimer._t);
  session.usedMs = Date.now() - session.startedAt;
  const essays = session.items.map((it, i) => ({ it, i })).filter(x => x.it.q.type !== 'mcq');
  main.innerHTML = `<section class="card"><h2><span class="spin"></span> 채점 중</h2><p id="gprog" class="muted">객관식 채점 중…</p></section>`;
  for (let i = 0; i < session.items.length; i++) if (session.items[i].q.type === 'mcq') await gradeOne(i);
  // 단답형·서술형은 AI 를 쓸 수 있어서 두 개씩 나눠 보낸다.
  let done = 0;
  const queue = [...essays];
  const worker = async () => {
    while (queue.length) {
      const { i } = queue.shift();
      await gradeOne(i);
      done++;
      const el = document.getElementById('gprog');
      if (el) el.textContent = `단답형·서술형 ${done}/${essays.length}`;
    }
  };
  await Promise.all([worker(), worker()]);
  const res = session.results;
  const eIdx = session.items.map((_, i) => i).filter(i => res[i]?.fb?.max);
  S.recordExam({
    sess: session.id, n: session.items.length,
    ok: session.items.filter((_, i) => res[i]?.result === 'ok').length,
    part: session.items.filter((_, i) => res[i]?.result === 'part').length,
    sc: eIdx.reduce((a, i) => a + res[i].fb.score, 0), mx: eIdx.reduce((a, i) => a + res[i].fb.max, 0),
    min: Math.round(session.usedMs / 60000),
    subj: [...new Set(session.items.map(x => x.pack.subject))],
  });
  session.viewing = false;
  if (params().path === '/run') render();
}

function viewSummary() {
  const items = session.items;
  const res = session.results;
  const count = k => items.filter((_, i) => res[i]?.result === k).length;
  const essayIdx = items.map((it, i) => i).filter(i => items[i].q.type === 'essay' && res[i]?.fb);
  const eScore = essayIdx.reduce((s, i) => s + res[i].fb.score, 0);
  const eMax = essayIdx.reduce((s, i) => s + res[i].fb.max, 0);
  const self = items.filter((_, i) => res[i]?.selfGrade && !res[i].result).length;
  const objIdx = items.map((it, i) => i).filter(i => items[i].q.type !== 'essay');
  const objOk = objIdx.filter(i => res[i]?.result === 'ok').length;
  main.innerHTML = `
  <h1>결과</h1>
  <section class="grid" style="margin-bottom:14px">
    <div class="stat"><b style="color:var(--ok)">${count('ok')}</b><span>맞음</span></div>
    <div class="stat"><b style="color:var(--warn)">${count('part')}</b><span>부분 점수</span></div>
    <div class="stat"><b style="color:var(--bad)">${count('wrong')}</b><span>틀림</span></div>
    ${objIdx.length ? `<div class="stat"><b>${objOk}/${objIdx.length}</b><span>객관식·단답형</span></div>` : ''}
    ${eMax ? `<div class="stat"><b>${eScore}/${eMax}</b><span>서술형 점수</span></div>` : ''}
    ${session.usedMs ? `<div class="stat"><b>${Math.round(session.usedMs / 60000)}분</b><span>걸린 시간</span></div>` : ''}
  </section>
  ${self ? `<p class="note">스스로 채점할 서술형이 ${self}개 남았다. 눌러서 채점한다.</p>` : ''}
  <section class="card flat"><ul class="list">${items.map((it, i) => {
    const r = res[i];
    const tag = r?.result === 'ok' ? '<span class="tag ok">맞음</span>' : r?.result === 'part' ? '<span class="tag warn">부분</span>' : r?.result === 'wrong' ? '<span class="tag bad">틀림</span>' : r?.selfGrade ? '<span class="tag vio">채점 필요</span>' : '<span class="tag">안 풂</span>';
    return `<li><a class="item" href="#" data-open="${i}"><span class="mono small" style="width:2em">${i + 1}</span><span class="grow">${esc(it.q.question.slice(0, 70))}${it.q.question.length > 70 ? '…' : ''}<br><span class="small muted">${subjName(it.pack.subject)} · ${TYPE_NAME[it.q.type]}${r?.fb?.max ? ` · ${r.fb.score}/${r.fb.max}점` : ''}</span></span>${tag}</a></li>`;
  }).join('')}</ul></section>
  <div class="row">
    ${count('wrong') + count('part') ? '<button class="btn pri" id="retryWrong">틀린 것만 다시</button>' : ''}
    <a class="btn" href="#/quiz">다른 문제</a>
    <a class="btn ghost" href="#/">홈</a>
  </div>`;
  $$('[data-open]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    session.i = Number(a.dataset.open);
    session.viewing = true;
    if (session.mode === 'practice') session.mode = 'review';
    drawQuestion();
  }));
  $('#retryWrong')?.addEventListener('click', () => {
    const again = items.filter((_, i) => res[i]?.result === 'wrong' || res[i]?.result === 'part');
    startSession(again, 'practice');
  });
}

// ================= 오답노트 =================
const CAUSES = [['concept', '개념 부족'], ['memo', '암기 부족'], ['mistake', '실수'], ['read', '문제 잘못 읽음'], ['time', '시간 부족']];
const causeOf = key => S.kvGet('wcause', key)?.cause || '';
function viewWrong() {
  const { q } = params();
  const sel = q.get('s') || '';
  const cz = q.get('c') || '';
  const prog = S.getProgress();
  const items = wrongItems().filter(x => (!sel || x.pack.subject === sel) && (!cz || (cz === 'none' ? !causeOf(x.key) : causeOf(x.key) === cz)));
  const subjects = SUBJECTS.filter(s => wrongItems().some(x => x.pack.subject === s.id));
  main.innerHTML = `
  <div class="row between"><h1 style="margin:0">오답노트</h1>${items.length ? `<button class="btn pri sm" id="retry">${items.length}문제 다시 풀기</button>` : ''}</div>
  <p class="small muted">틀리거나 부분 점수를 받은 문제가 모인다. 두 번 연속 맞히면 빠진다.</p>
  ${subjects.length ? chipGroup('ws', [{ value: '', label: '전체' }, ...subjects.map(s => ({ value: s.id, label: s.name, dot: true }))], [sel], false) : ''}
  ${wrongItems().length ? `<div class="chips" style="margin-top:6px"><span class="small muted" style="align-self:center">원인</span>${[['', '전체'], ...CAUSES, ['none', '안 적음']].map(([v, l]) => `<a class="chip${cz === v ? ' on' : ''}" href="#/wrong?${new URLSearchParams({ ...(sel ? { s: sel } : {}), ...(v ? { c: v } : {}) })}">${l}</a>`).join('')}</div>` : ''}
  <div class="stack" style="margin-top:12px">${items.map(x => {
    const r = prog[x.key];
    const qq = x.q;
    let right = '';
    if (qq.type === 'mcq') right = (Array.isArray(qq.answer) ? qq.answer : [qq.answer]).map(n => `${'①②③④⑤⑥'[n - 1]} ${esc(qq.choices[n - 1])}`).join('<br>');
    if (qq.type === 'short') right = qq.answers.map(esc).join(' / ');
    if (qq.type === 'essay') right = esc(qq.model_answer);
    let mine = r.ans;
    if (qq.type === 'mcq' && Array.isArray(mine)) mine = mine.map(n => '①②③④⑤⑥'[n - 1]).join(', ');
    return `<details class="card flat"><summary style="color:var(--ink)"><span class="q-head" style="display:inline-flex;margin:0">${subjDot(x.pack.subject)}<span class="tag">${TYPE_NAME[qq.type]}</span><span class="tag bad">${r.ok}/${r.n}</span>${r.star ? '<span class="tag warn">★</span>' : ''}</span><br>${esc(qq.question)}</summary>
      ${qq.context ? `<div class="q-ctx">${esc(qq.context)}</div>` : ''}
      ${qq.type === 'mcq' ? `<ol class="small">${qq.choices.map(c => `<li>${esc(c)}</li>`).join('')}</ol>` : ''}
      <p><b>내 답</b> <span style="white-space:pre-wrap">${esc(mine || '(안 씀)')}</span></p>
      <p><b>정답</b> <span style="white-space:pre-wrap">${right}</span></p>
      ${r.fb?.missing ? `<p><b>AI 피드백</b> ${esc(r.fb.missing)}</p>` : ''}
      ${r.fb?.reason ? `<p><b>AI 피드백</b> ${esc(r.fb.reason)}</p>` : ''}
      ${qq.explanation ? `<p><b>해설</b> ${esc(qq.explanation)}</p>` : ''}
      <p class="small muted">${esc(x.pack.title)} · 마지막 ${esc(r.at || '')}</p>
      <div class="chips" style="margin:6px 0"><span class="small muted" style="align-self:center">왜 틀렸나</span>${CAUSES.map(([v, l]) => `<button type="button" class="chip${causeOf(x.key) === v ? ' on' : ''}" data-cause="${v}" data-ck="${esc(x.key)}">${l}</button>`).join('')}</div>
      <div class="row"><button class="btn sm" data-one="${esc(x.key)}">이 문제 풀기</button><a class="btn sm ghost" href="#/q?key=${encodeURIComponent(x.key)}">풀이 이력 ${r.n}번</a><button class="btn sm ghost" data-done="${esc(x.key)}">이제 안다 (빼기)</button></div>
    </details>`;
  }).join('') || '<p class="muted">오답이 없다.</p>'}</div>`;
  $$('input[name="ws"]').forEach(r => r.addEventListener('change', () => { location.hash = '#/wrong' + (r.value ? '?s=' + r.value : ''); }));
  $('#retry')?.addEventListener('click', () => startSession(shuffle(items), 'practice'));
  $$('[data-one]').forEach(b => b.addEventListener('click', () => startSession(items.filter(x => x.key === b.dataset.one), 'practice')));
  $$('[data-done]').forEach(b => b.addEventListener('click', () => { S.setFlag(b.dataset.done, 'wrong', false); toast('오답노트에서 뺐다.'); render.keepScroll = true; render(); }));
  $$('[data-cause]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.ck;
    if (causeOf(k) === b.dataset.cause) S.kvDel('wcause', k); else S.kvSet('wcause', k, { cause: b.dataset.cause });
    const box = b.closest('.chips');
    box.querySelectorAll('[data-cause]').forEach(x => x.classList.toggle('on', x === b && causeOf(k) === b.dataset.cause));
  }));
}

// ================= 암기카드 =================
let flash = null;
function viewCardsSetup() {
  const all = D.allCards();
  if (!all.length) { main.innerHTML = '<h1>암기카드</h1><p class="muted">카드가 들어 있는 자료가 없다.</p>'; return; }
  const last = S.load('cardPrefs', { subject: [], packs: [], src: 'due', flip: 'front' });
  const packs = D.db().packs.filter(p => (p.cards || []).length);
  main.innerHTML = `<h1>암기카드</h1>
  <form id="cf" class="card">
    <h3>과목</h3>${chipGroup('subject', SUBJECTS.filter(s => packs.some(p => p.subject === s.id)).map(s => ({ value: s.id, label: s.name, dot: true })), last.subject)}
    <h3 style="margin-top:14px">단원</h3><div id="cpacks"></div>
    <h3 style="margin-top:14px">어떤 카드</h3>${chipGroup('src', [{ value: 'due', label: '외울 때 된 카드 + 새 카드' }, { value: 'all', label: '전부' }, { value: 'miss', label: '모른다고 한 카드' }], [last.src], false)}
    <h3 style="margin-top:14px">먼저 볼 면</h3>${chipGroup('flip', [{ value: 'front', label: '앞면 (문제)' }, { value: 'back', label: '뒷면 (답)' }], [last.flip], false)}
    <p class="small muted" id="ccount"></p>
    <button class="btn pri block">시작</button>
  </form>`;
  const draw = () => {
    const subs = picked('subject');
    $('#cpacks').innerHTML = chipGroup('packs', packs.filter(p => !subs.length || subs.includes(p.subject)).map(p => ({ value: p.id, label: p.title })), last.packs);
    $$('input[name="packs"]').forEach(i => i.addEventListener('change', cnt));
    cnt();
  };
  const collect = () => ({ subject: picked('subject'), packs: picked('packs'), src: picked('src')[0], flip: picked('flip')[0] });
  const cnt = () => { $('#ccount').textContent = `카드 ${pickCards(collect()).length}장`; };
  $$('input[name="subject"]').forEach(i => i.addEventListener('change', draw));
  $$('input[name="src"]').forEach(i => i.addEventListener('change', cnt));
  draw();
  $('#cf').addEventListener('submit', e => {
    e.preventDefault();
    const c = collect();
    S.save('cardPrefs', c);
    const list = shuffle(pickCards(c));
    if (!list.length) return toast('해당하는 카드가 없다.');
    flash = { list, i: 0, back: false, knew: 0, flip: c.flip };
    location.hash = '#/flash';
  });
}
function pickCards(c) {
  const t = S.today();
  let list = D.allCards({ subject: c.subject, packs: c.packs });
  if (c.src === 'due') list = list.filter(x => { const r = S.cp(x.key); return !r || !r.due || r.due <= t; });
  if (c.src === 'miss') list = list.filter(x => { const r = S.cp(x.key); return r && r.n && r.box === 0; });
  return list;
}
function viewFlash() {
  const { q } = params();
  if (q.get('pack')) {
    const list = D.allCards({ packs: [q.get('pack')] });
    flash = { list: shuffle(list), i: 0, back: false, knew: 0, flip: 'front' };
    history.replaceState(null, '', '#/flash');
  }
  if (!flash || !flash.list.length) { main.innerHTML = '<p class="muted">카드가 없다. <a href="#/cards">카드 고르기</a></p>'; return; }
  if (flash.i >= flash.list.length) {
    main.innerHTML = `<h1>다 봤다</h1><p>${flash.list.length}장 중 ${flash.knew}장을 알았다.</p><div class="row"><a class="btn pri" href="#/cards">다시 고르기</a><a class="btn" href="#/">홈</a></div>`;
    return;
  }
  const x = flash.list[flash.i];
  const showBack = flash.flip === 'back' ? !flash.back : flash.back;
  main.innerHTML = `
  <div class="row between"><span class="small muted">${flash.i + 1} / ${flash.list.length} · ${subjName(x.pack.subject)} · ${esc(x.pack.title)}</span><a class="btn sm ghost" href="#/cards">그만</a></div>
  <div class="bar" style="margin:8px 0 14px"><i style="width:${pct(flash.i, flash.list.length)}%"></i></div>
  <section class="card flash ${showBack ? 'back' : ''}" id="fc" role="button" tabindex="0" aria-label="카드 뒤집기">
    <span class="side">${showBack ? '뒷면' : '앞면'} · 눌러서 뒤집기</span>
    <div>${esc(showBack ? x.c.back : x.c.front)}</div>
    ${showBack && x.c.note ? `<p class="small muted" style="margin-top:10px">${esc(x.c.note)}</p>` : ''}
  </section>
  ${flash.back ? `<div class="row" style="justify-content:center"><button class="btn bad" id="no" style="flex:1">몰랐다</button><button class="btn ok" id="yes" style="flex:1">알았다</button></div>` : '<p class="small muted" style="text-align:center">떠올려 본 다음 뒤집는다.</p>'}`;
  if (!flash.shownAt || flash.shownFor !== flash.i) { flash.shownAt = Date.now(); flash.shownFor = flash.i; }
  const flip = () => { flash.back = !flash.back; viewFlash(); };
  $('#fc').addEventListener('click', flip);
  $('#fc').addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
  const next = knew => { S.recordCard(x.key, knew, Date.now() - flash.shownAt); flash.shownAt = 0; if (knew) flash.knew++; else flash.list.push(x); flash.i++; flash.back = false; viewFlash(); };
  $('#yes')?.addEventListener('click', () => next(true));
  $('#no')?.addEventListener('click', () => next(false));
}

// ================= AI 문제 만들기 =================
let genResult = null;
function viewGen() {
  const { q } = params();
  const packs = D.db().packs.filter(p => p.notes && !/-ai(-[a-z0-9]+)?$/.test(p.id));
  const id = q.get('pack') || '';
  const p = D.db().byId[id];
  main.innerHTML = `
  <h1>AI 문제 만들기</h1>
  <p class="small muted">공부자료 본문을 보고 Claude 가 새 문제를 만든다. 만든 문제는 이 기기에 "(AI 문제)" 자료로 저장된다.</p>
  ${AI.hasKey() ? '' : '<p class="note info">API 키가 없으면 무료로: "채팅용 프롬프트 복사" → claude.ai 나 공부 Claude 채팅에 붙여넣기 → 받은 JSON 을 <a href="#/settings">설정 → 자료 가져오기</a> 에 붙여넣기.</p>'}
  <form id="gf" class="card">
    <label class="field"><span>자료</span><select name="pack">${packs.map(x => `<option value="${esc(x.id)}"${x.id === id ? ' selected' : ''}>${subjName(x.subject)} · ${esc(x.title)}</option>`).join('')}</select></label>
    <h3>유형</h3>${chipGroup('types', Object.entries(TYPE_NAME).map(([v, l]) => ({ value: v, label: l })), ['mcq', 'short', 'essay'])}
    <div class="grid" style="margin-top:10px">
      <label class="field"><span>개수</span><select name="count">${[3, 5, 10, 15].map(n => `<option${n === 5 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field"><span>난이도</span><select name="diff"><option value="0">고르게</option><option value="1">쉬움</option><option value="2">보통</option><option value="3">어려움</option></select></label>
    </div>
    <label class="field"><span>특히 이 부분 (선택)</span><input type="text" name="focus" placeholder="예: 3연의 표현법, 관계대명사 what"></label>
    ${AI.hasKey() ? `<button class="btn pri block"${packs.length ? '' : ' disabled'}>만들기</button>` : ''}
    <button type="button" class="btn block${AI.hasKey() ? ' ghost' : ' pri'}" id="genCopy" style="margin-top:8px"${packs.length ? '' : ' disabled'}>채팅용 프롬프트 복사 (무료)</button>
    <pre class="prompt" id="genPre" hidden></pre>
  </form>
  <div id="genOut"></div>`;
  const out = $('#genOut');
  const showResult = () => {
    if (!genResult) return;
    out.innerHTML = `<h2>만든 문제 ${genResult.qs.length}개</h2>
    <div class="stack">${genResult.qs.map((x, i) => `<details class="card flat"><summary style="color:var(--ink)"><span class="tag">${TYPE_NAME[x.type]}</span> ${esc(x.question)}</summary>
      ${x.context ? `<div class="q-ctx">${esc(x.context)}</div>` : ''}
      ${x.type === 'mcq' ? `<ol>${x.choices.map(c => `<li>${esc(c)}</li>`).join('')}</ol><p>정답 ${x.answer}</p>` : ''}
      ${x.type === 'short' ? `<p>정답 ${x.answers.map(esc).join(' / ')}</p>` : ''}
      ${x.type === 'essay' ? `<p style="white-space:pre-wrap">모범 답안: ${esc(x.model_answer)}</p><ul>${x.rubric.map(r => `<li>${esc(r.criterion)} (${r.points})</li>`).join('')}</ul>` : ''}
      <p class="small">${esc(x.explanation)}</p>
      <button type="button" class="btn sm ghost" data-drop="${i}">이 문제 빼기</button></details>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="btn pri" id="saveGen">저장하고 풀기</button><button class="btn" id="saveOnly">저장만</button></div>`;
    $$('[data-drop]', out).forEach(b => b.addEventListener('click', () => { genResult.qs.splice(Number(b.dataset.drop), 1); showResult(); }));
    const saveIt = () => {
      const src = D.db().byId[genResult.packId];
      const aid = src.id + '-ai';
      const exist = D.db().byId[aid];
      const stamp = Date.now().toString(36);
      const qs = genResult.qs.map((x, i) => ({ id: `ai-${stamp}-${i + 1}`, ...x, source: 'AI 생성' }));
      const pk = {
        format: D.FORMAT, id: aid, subject: src.subject, unit: src.unit || src.title, order: (src.order ?? 999) + 0.5,
        title: `${src.title} (AI 문제)`, summary: `"${src.title}" 자료로 AI 가 만든 문제.`, notes: '',
        questions: [...(exist?.questions || []), ...qs], updated: new Date().toISOString(),
      };
      D.saveLocalPacks([pk]);
      return D.loadAll().then(() => ({ pk, qs }));
    };
    $('#saveGen').addEventListener('click', async () => {
      const { pk, qs } = await saveIt();
      S.recordGen(pk.id, qs.length);
      const ids = new Set(qs.map(x => x.id));
      genResult = null;
      startSession(D.allQuestions({ packs: [pk.id] }).filter(x => ids.has(x.q.id)), 'practice');
    });
    $('#saveOnly').addEventListener('click', async () => { const { pk, qs } = await saveIt(); S.recordGen(pk.id, qs.length); genResult = null; toast('저장했다.'); render(); });
  };
  showResult();
  $('#genCopy').addEventListener('click', () => {
    const f = $('#gf');
    const types = picked('types');
    if (!types.length) return toast('유형을 하나 이상 고른다.');
    const src = D.db().byId[f.pack.value];
    const newId = `${src.id}-ai-${Date.now().toString(36)}`;
    copyText(AI.genChatPrompt(src, { types, count: Number(f.count.value), difficulty: Number(f.diff.value), focus: f.focus.value.trim() }, newId), $('#genPre'));
  });
  $('#gf').addEventListener('submit', async e => {
    e.preventDefault();
    if (!AI.hasKey()) return;
    const f = e.target;
    const types = picked('types');
    if (!types.length) return toast('유형을 하나 이상 고른다.');
    const src = D.db().byId[f.pack.value];
    const btn = f.querySelector('button.pri');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> 만드는 중 (1분쯤 걸린다)';
    try {
      const qs = await AI.generateQuestions(src, { types, count: Number(f.count.value), difficulty: Number(f.diff.value), focus: f.focus.value.trim() });
      const errs = D.validatePack({ id: 'x', subject: src.subject, title: 'x', questions: qs.map((x, i) => ({ id: 'g' + i, ...x })) });
      genResult = { packId: src.id, qs: qs.filter((x, i) => !errs.some(m => m.includes(`questions[${i}]`))) };
      showResult();
    } catch (err) {
      toast(err.message, 4500);
    }
    btn.disabled = false;
    btn.textContent = '만들기';
  });
}

// ================= 일정·계획 =================
function viewPlan() {
  const ex = examInfo();
  const all = planList().filter(p => !p.hidden);
  const plan = all.filter(p => !p.notion);
  const t = S.today();
  const byDate = {};
  for (const p of plan) (byDate[p.date] = byDate[p.date] || []).push(p);
  const np = D.db().plan;
  const byId = Object.fromEntries(all.map(p => [p.id, p]));
  const weeksHtml = np && np.weeks ? np.weeks.map(w => {
    const items = w.groups.flatMap(g => g.items.map(i => byId[i.id]).filter(Boolean));
    const done = items.filter(i => i.done).length;
    const isCur = w.start <= t && t <= w.end;
    return `<details class="card flat week${isCur ? ' cur' : ''}"${isCur ? ' open' : ''}>
      <summary><b>${esc(w.title)}</b> ${w.stage ? `<span class="tag vio">${esc(w.stage)}</span>` : ''}${isCur ? ' <span class="tag ok">이번 주</span>' : ''}${w.overlap ? ` <span class="tag warn">${esc(w.overlap)}</span>` : ''} <span class="small muted">${done}/${items.length}</span>
        <div class="bar" style="margin-top:6px"><i style="width:${pct(done, items.length)}%"></i></div></summary>
      ${w.note ? `<p class="small muted" style="white-space:pre-wrap">${esc(w.note)}</p>` : ''}
      ${w.groups.map(g => {
        const gi = g.items.map(i => byId[i.id]).filter(Boolean);
        if (!gi.length) return '';
        const self = g.items.length === 1 && g.items[0].self;
        return `<div class="wgroup"><div class="wg-h">${g.subject ? subjDot(g.subject) : g.label ? `<span class="tag">${esc(g.label)}</span>` : ''} <b>${esc(self ? '' : g.title)}</b></div>
          <ul class="list">${gi.map(p => `<li class="item" style="align-items:flex-start"><input type="checkbox" data-pc="${p.id}"${p.done ? ' checked' : ''} style="margin-top:5px"><span class="pdate mono small${p.date === t ? ' today' : ''}">${p.date ? Number(p.date.slice(5, 7)) + '/' + Number(p.date.slice(8)) : '이번 주'}</span><span class="grow"${p.done ? ' style="text-decoration:line-through;color:var(--ink3)"' : ''}>${esc(p.text)}</span></li>`).join('')}</ul></div>`;
      }).join('')}
      ${w.url ? `<p class="small"><a href="${esc(w.url)}" target="_blank" rel="noopener">Notion 에서 보기</a></p>` : ''}
    </details>`;
  }).join('') : '';
  main.innerHTML = `
  <h1>시험 일정과 계획</h1>
  ${weeksHtml ? `<div class="sec-title"><h2>주간 공부 계획</h2><span class="small muted">Notion 주간 계획 · 이 기기와 비공개 Gist 에만 저장</span></div>${weeksHtml}
  <p class="small"><button class="btn sm ghost bad" id="planDel">주간 계획 지우기</button></p>` : `<p class="note info">Notion 주간 계획 파일(study-hub-plan.json)을 <a href="#/settings">설정 → 자료 가져오기</a> 에서 "파일 고르기" 로 넣으면 여기에 주차별 계획이 나온다. 이 기기와 비공개 Gist 에만 저장된다.</p>`}
  <section class="card">
    <h2>과목별 시험 날짜·범위</h2>
    <p class="small muted">아직 정해지지 않았으면 "미정". 여기서 고친 값은 이 기기에만 저장된다. 저장소의 data/exam.json 이 바뀌면 그 값이 기본값이 된다.</p>
    <form id="ef">${SUBJECTS.map(s => {
      const v = ex.subjects[s.id] || {};
      return `<div style="padding:10px 0;border-top:1px solid var(--rule)">
        <div class="row between"><b>${subjDot(s.id)} ${s.name}</b>
        <select name="d_${s.id}" style="width:auto">${['', ...ex.days].map(d => `<option value="${d}"${(v.date || '') === d ? ' selected' : ''}>${d ? S.fmtDate(d) : '미정'}</option>`).join('')}</select></div>
        <textarea name="r_${s.id}" rows="2" style="min-height:52px;margin-top:6px" placeholder="시험 범위">${esc(v.range || '')}</textarea>
      </div>`;
    }).join('')}
    <div class="row"><button class="btn pri">저장</button><button type="button" class="btn ghost" id="resetExam">저장소 값으로 되돌리기</button></div></form>
  </section>

  <section class="card">
    <h2>내가 더한 계획</h2>
    <form id="pf" class="grid2">
      <label class="field"><span>날짜</span><input type="date" name="date" value="${t}" required></label>
      <label class="field"><span>과목</span><select name="subject"><option value="">없음</option>${SUBJECTS.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select></label>
      <label class="field" style="grid-column:1/-1"><span>할 일</span><input type="text" name="text" required placeholder="예: 한국사 2단원 자료 읽고 문제 20개"></label>
      <button class="btn pri" style="grid-column:1/-1">추가</button>
    </form>
    ${Object.keys(byDate).length ? Object.entries(byDate).map(([d, list]) => `
      <h3 style="margin-top:16px">${S.fmtDate(d)} ${d === t ? '<span class="tag ok">오늘</span>' : d < t ? '<span class="tag">지남</span>' : ''}</h3>
      <ul class="list">${list.map(p => `<li class="item"><input type="checkbox" data-pc="${p.id}"${p.done ? ' checked' : ''}><span class="grow"${p.done ? ' style="text-decoration:line-through;color:var(--ink3)"' : ''}>${p.subject ? subjDot(p.subject) + ' ' : ''}${esc(p.text)}</span><button class="btn sm ghost" data-pd="${p.id}" aria-label="지우기">✕</button></li>`).join('')}</ul>`).join('') : '<p class="muted small">계획이 없다.</p>'}
    ${plan.some(p => p.done) ? '<button class="btn sm ghost" id="clearDone" style="margin-top:10px">끝낸 계획 지우기</button>' : ''}
  </section>`;
  $('#ef').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const out = {};
    for (const s of SUBJECTS) out[s.id] = { date: f['d_' + s.id].value || null, range: f['r_' + s.id].value };
    D.saveExamLocal(out);
    D.loadAll().then(() => { toast('저장했다.'); render(); });
  });
  $('#planDel')?.addEventListener('click', async () => { if (!confirm('주간 공부 계획을 지울까? 체크한 기록은 남는다.')) return; D.clearPlan(); await D.loadAll(); render(); });
  $('#resetExam').addEventListener('click', () => { if (!confirm('내가 고친 날짜와 범위를 지울까?')) return; D.clearExamLocal(); D.loadAll().then(render); });
  $('#pf').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    S.kvSet('plan', id, { id, date: f.date.value, subject: f.subject.value, text: f.text.value.trim(), done: false, c: Date.now() });
    render.keepScroll = true; render();
  });
  $$('[data-pc]').forEach(cb => cb.addEventListener('change', () => { setPlan(cb.dataset.pc, { done: cb.checked, doneAt: cb.checked ? Date.now() : null }); render.keepScroll = true; render(); }));
  $$('[data-pd]').forEach(b => b.addEventListener('click', () => { S.kvDel('plan', b.dataset.pd); render.keepScroll = true; render(); }));
  $('#clearDone')?.addEventListener('click', () => { if (!confirm('끝낸 계획을 목록에서 지울까? 공부 일지에는 남는다.')) return; for (const p of planList()) if (p.done) setPlan(p.id, { hidden: true }); render.keepScroll = true; render(); });
}

// ================= 기록·타이머 =================
// 날짜별로 쌓인 값과 누적값
function dailySeries() {
  const log = S.getLog();
  const evs = S.getEvents();
  const first = evs.length ? S.ymd(new Date(evs[0].t)) : S.today();
  const days = CH.dayRange(first < S.today() ? first : S.today(), S.today());
  let cq = 0, cs = 0, cc = 0;
  return days.map(d => {
    const l = log[d] || {};
    const sec = Math.max(S.studySec(l), (l.min || 0) * 60);
    cq += l.q || 0; cs += sec; cc += l.c || 0;
    return { d, l, sec, cq, cs, cc };
  });
}
function subjectTime() {
  const out = {};
  const subjOfPack = id => D.db().byId[id]?.subject;
  for (const e of S.getEvents()) {
    let sub = null, sec = 0;
    if (e.k === 'r') { sub = subjOfPack(e.pack); sec = e.s; }
    else if (e.k === 'a') { sub = subjOfPack(e.key.split('::')[0]); sec = Math.min(900, (e.ms || 0) / 1000); }
    else if (e.k === 'c') { sub = subjOfPack(e.key.split('::')[0]); sec = Math.min(120, (e.ms || 0) / 1000); }
    if (sub) out[sub] = (out[sub] || 0) + sec;
  }
  return out;
}
function milestones(series) {
  const hlCount = Object.keys(S.kvAll('hl')).length;
  const out = [];
  const reach = (label, test) => { const hit = series.find(test); out.push({ label, date: hit ? hit.d : null }); };
  [50, 100, 300, 500, 1000].forEach(n => reach(`문제 ${n}개 풀기`, x => x.cq >= n));
  [1, 5, 10, 20, 40].forEach(h => reach(`공부 ${h}시간`, x => x.cs >= h * 3600));
  [100, 500, 1000].forEach(n => reach(`카드 ${n}장 넘기기`, x => x.cc >= n));
  let run = 0;
  const streakHit = {};
  for (const x of series) { run = studied(x.l) ? run + 1 : 0; for (const n of [3, 7, 14, 30]) if (run >= n && !streakHit[n]) streakHit[n] = x.d; }
  [3, 7, 14, 30].forEach(n => out.push({ label: `${n}일 연속 공부`, date: streakHit[n] || null }));
  out.push({ label: '형광펜·메모 30개', date: hlCount >= 30 ? '달성' : null });
  return out;
}

function viewStats() {
  const series = dailySeries();
  const last = series[series.length - 1];
  const total = series.reduce((a, x) => ({ q: a.q + (x.l.q || 0), ok: a.ok + (x.l.ok || 0), min: a.min + (x.l.min || 0) }), { q: 0, ok: 0, min: 0 });
  const st = subjectStats();
  const stime = subjectTime();
  const units = unitStats().filter(u => u.n).sort((a, b) => a.rate - b.rate);
  const tm = S.load('timer', null);
  const ex = examInfo();
  const studiedDays = series.filter(x => studied(x.l)).length;

  // 잔디: 처음 기록한 날(없으면 오늘)부터 마지막 시험일까지
  const lastExam = ex.days[ex.days.length - 1] || S.today();
  // 처음 기록한 달 1일부터 마지막 시험이 있는 달 말일까지
  const calEnd = (() => { const e = lastExam > S.today() ? lastExam : S.today(); const [y, m] = e.split('-').map(Number); return S.ymd(new Date(y, m, 0)); })();
  const heatDays = CH.dayRange(series[0].d.slice(0, 8) + '01', calEnd).map(d => {
    const x = series.find(y => y.d === d);
    const l = x?.l || {};
    const m = Math.round((x?.sec || 0) / 60);
    return { date: d, value: m, future: d > S.today(), label: `${S.fmtDate(d)}\n${d > S.today() ? '아직' : `공부 ${S.fmtDur(x?.sec || 0)} · 문제 ${l.q || 0} · 카드 ${l.c || 0}`}${ex.days.includes(d) ? '\n시험일' : ''}` };
  });
  // 7일 정답률
  const acc = series.map((x, i) => {
    const w = series.slice(Math.max(0, i - 6), i + 1);
    const q = w.reduce((a, y) => a + (y.l.q || 0), 0), ok = w.reduce((a, y) => a + (y.l.ok || 0), 0);
    return { x: x.d, y: q >= 5 ? Math.round((ok / q) * 100) : null, tip: `${S.fmtDate(x.d)}\n최근 7일 ${q}문제 · ${q ? Math.round((ok / q) * 100) : 0}%` };
  });
  const ms = milestones(series);

  main.innerHTML = `
  <div class="row between"><h1 style="margin:0">공부 기록</h1><a class="btn sm" href="#/journal">공부 일지 보기</a></div>
  <section class="grid" style="margin:12px 0 14px">
    <div class="stat"><b>${S.fmtDur(last.cs)}</b><span>쌓인 공부 시간</span></div>
    <div class="stat"><b>${total.q}</b><span>푼 문제 · 정답률 ${pct(total.ok, total.q)}%</span></div>
    <div class="stat"><b>${studiedDays}일</b><span>공부한 날 · 연속 ${streakDays()}일</span></div>
    <div class="stat"><b>${Object.keys(S.kvAll('hl')).length}</b><span>형광펜·메모</span></div>
  </section>

  <section class="card">
    <h2>공부한 날</h2>
    <p class="small muted">색이 진할수록 그날 오래 공부했다 (자료 읽기 + 문제 풀이 + 카드, 또는 집중 타이머 중 긴 쪽). 날짜를 누르면 그날 공부 일지가 열린다.</p>
    ${CH.monthCalendar(heatDays, { marks: ex.days, today: S.today() })}
  </section>

  <div class="grid2">
    <section class="card"><h2>누적 푼 문제</h2><div data-chart="cq"></div></section>
    <section class="card"><h2>누적 공부 시간</h2><div data-chart="cs"></div></section>
  </div>
  <section class="card"><h2>정답률 변화</h2><p class="small muted">그날까지 최근 7일 동안 푼 문제의 정답률. 5문제 미만인 날은 비운다.</p><div data-chart="acc"></div></section>

  <section class="card">
    <h2>집중 타이머</h2>
    <p class="timer" id="ft" style="font-size:2.2rem;margin:6px 0">${tm ? '' : '25:00'}</p>
    <div class="row">${tm ? '<button class="btn bad" id="tStop">멈추기</button>' : [25, 50].map(m => `<button class="btn${m === 25 ? ' pri' : ''}" data-tm="${m}">${m}분</button>`).join('')}</div>
    <p class="small muted">끝까지 채우면 공부 일지에 남는다. 다른 화면으로 가도 계속 돈다. 지금까지 ${S.fmtDur(total.min * 60)}.</p>
  </section>

  <section class="card">
    <h2>과목별</h2>
    <table class="crit"><tr><td class="small muted">과목</td><td class="pt small muted">공부 시간</td><td class="pt small muted">푼 문제</td><td class="pt small muted">정답률</td></tr>
    ${SUBJECTS.map(s => { const o = st[s.id]; return `<tr><td>${subjDot(s.id)} ${s.name}</td><td class="pt">${S.fmtDur(stime[s.id] || 0)}</td><td class="pt">${o.tried}/${o.total}</td><td class="pt">${o.n ? pct(o.ok, o.n) + '%' : '-'}</td></tr>`; }).join('')}</table>
  </section>

  ${(() => {
    // 메타인지: 확신도별로 실제로 맞힌 비율
    const ev = S.getEvents().filter(e => e.k === 'a' && e.conf);
    const row = (c, l) => { const xs = ev.filter(e => e.conf === c); const ok = xs.filter(e => e.r === 'ok' || e.guessed).length; return xs.length ? `<tr><td>${l}</td><td class="pt">${xs.length}번</td><td class="pt">${pct(ok, xs.length)}% 맞음</td></tr>` : ''; };
    const causes = {};
    for (const x of D.allQuestions()) { const c = causeOf(x.key); if (c) causes[c] = (causes[c] || 0) + 1; }
    const nc = Object.values(causes).reduce((a, b) => a + b, 0);
    if (!ev.length && !nc) return '';
    return `<section class="card"><h2>메타인지</h2>
      ${ev.length ? `<p class="small muted">"확실" 이라고 하고 틀린 게 많으면 잘못 알고 있는 개념이 있다는 뜻이다. "찍음" 으로 맞힌 문제는 복습에 다시 나온다.</p><table class="crit">${row('sure', '확실')}${row('unsure', '애매')}${row('guess', '찍음')}</table>` : ''}
      ${nc ? `<h3 style="margin-top:12px">오답 원인</h3><table class="crit">${CAUSES.filter(([v]) => causes[v]).map(([v, l]) => `<tr><td><a href="#/wrong?c=${v}">${l}</a></td><td class="pt">${causes[v]}문제</td><td class="pt">${pct(causes[v], nc)}%</td></tr>`).join('')}</table>` : ''}
    </section>`;
  })()}
  ${units.length ? `<section class="card"><h2>단원별 정답률</h2><table class="crit">${units.map(u => `<tr><td><a href="#/pack?id=${encodeURIComponent(u.pack.id)}">${esc(u.pack.title)}</a><br><span class="small muted">${subjName(u.pack.subject)} · ${u.tried}/${u.total}문제 · 읽은 시간 ${S.fmtDur(S.readTimeOf(u.pack.id))}</span></td><td class="pt"><span class="tag ${u.rate >= 0.8 ? 'ok' : u.rate >= 0.5 ? 'warn' : 'bad'}">${Math.round(u.rate * 100)}%</span></td></tr>`).join('')}</table></section>` : ''}

  <section class="card">
    <h2>쌓은 기록</h2>
    <ul class="list ms">${ms.map(m => `<li class="item"><span class="ms-ic ${m.date ? 'on' : ''}">${m.date ? '✓' : ''}</span><span class="grow">${m.label}</span><span class="small muted">${m.date ? (m.date === '달성' ? '달성' : S.fmtDate(m.date)) : '아직'}</span></li>`).join('')}</ul>
  </section>`;
  // 그래프는 들어갈 칸의 실제 너비에 맞춰 그린다 (글자 크기가 일정하게)
  const charts = {
    cq: w => CH.line(series.map(x => ({ x: x.d, y: x.cq, tip: `${S.fmtDate(x.d)}\n누적 ${x.cq}문제 (그날 ${x.l.q || 0})` })), { width: w, fmt: v => Math.round(v) + '', label: '누적 푼 문제' }),
    cs: w => CH.line(series.map(x => ({ x: x.d, y: x.cs / 3600, tip: `${S.fmtDate(x.d)}\n누적 ${S.fmtDur(x.cs)} (그날 ${S.fmtDur(x.sec)})` })), { width: w, fmt: v => (Math.round(v * 10) / 10) + 'h', label: '누적 공부 시간' }),
    acc: w => CH.line(acc, { width: w, height: 190, fmt: v => Math.round(v) + '%', yMax: 100, area: false, label: '최근 7일 정답률' }),
  };
  $$('[data-chart]').forEach(el => { el.innerHTML = charts[el.dataset.chart](el.clientWidth); });
  CH.bindTips(main);
  $$('.mcal .d[data-date]').forEach(el => el.addEventListener('click', () => { if (el.dataset.date <= S.today()) location.hash = '#/journal?d=' + el.dataset.date; }));
  $$('[data-tm]').forEach(b => b.addEventListener('click', () => { S.save('timer', { start: Date.now(), len: Number(b.dataset.tm) }); startTimerLoop(); render.keepScroll = true; render(); }));
  $('#tStop')?.addEventListener('click', () => {
    const t = S.load('timer', null);
    if (t) S.recordFocus(Math.floor((Date.now() - t.start) / 60000));
    S.remove('timer'); toast('멈췄다. 지난 시간은 기록했다.'); render.keepScroll = true; render();
  });
  startTimerLoop();
}
function startTimerLoop() {
  clearInterval(startTimerLoop._t);
  const tick = () => {
    const t = S.load('timer', null);
    if (!t) return clearInterval(startTimerLoop._t);
    const left = t.start + t.len * 60000 - Date.now();
    const el = document.getElementById('ft');
    if (left <= 0) {
      S.remove('timer');
      S.recordFocus(t.len);
      clearInterval(startTimerLoop._t);
      toast(`${t.len}분 집중 끝. 5분 쉬자.`, 5000);
      try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
      if (params().path === '/stats') { render.keepScroll = true; render(); }
      return;
    }
    if (el) el.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
  };
  tick();
  startTimerLoop._t = setInterval(tick, 1000);
}

// ================= 공부 일지 =================
// 하루의 일들을 묶어서 문장으로 보여준다
function dayEntries(d) {
  const evs = S.getEvents().filter(e => S.ymd(new Date(e.t)) === d);
  const out = [];
  let run = null; // 이어서 푼 문제 묶음
  const flushRun = () => { if (run) { out.push(run); run = null; } };
  for (const e0 of evs) {
    // 나중에 "맞음으로 고침" 한 풀이는 고친 결과로 보여준다
    const e = e0.k === 'a' ? (S.attemptsOf(e0.key).find(x => x.id === e0.id) || e0) : e0;
    if (e.k === 'a') {
      if (run && (run.sess === e.sess || e.t - run.end < 15 * 60000) && run.kind === 'solve') { run.items.push(e); run.end = e.t; continue; }
      flushRun();
      run = { kind: 'solve', t: e.t, end: e.t, sess: e.sess, items: [e] };
      continue;
    }
    if (e.k === 'c') {
      if (run && run.kind === 'cards' && e.t - run.end < 15 * 60000) { run.items.push(e); run.end = e.t; continue; }
      flushRun();
      run = { kind: 'cards', t: e.t, end: e.t, items: [e] };
      continue;
    }
    if (e.k === 'o' || e.k === 'f') continue;
    flushRun();
    out.push({ kind: e.k, t: e.t, e });
  }
  flushRun();
  // 형광펜·메모, 끝낸 계획
  const marks = Object.values(S.kvAll('hl')).filter(h => S.ymd(new Date(h.c)) === d);
  const byPack = {};
  for (const h of marks) (byPack[h.pack] = byPack[h.pack] || []).push(h);
  for (const pk in byPack) out.push({ kind: 'hl', t: Math.min(...byPack[pk].map(h => h.c)), pack: pk, list: byPack[pk] });
  for (const p of planList()) if (p.done && p.doneAt && S.ymd(new Date(p.doneAt)) === d) out.push({ kind: 'plan', t: p.doneAt, p });
  const notes = Object.values(S.kvAll('pnote')).filter(n => S.ymd(new Date(n.u)) === d);
  for (const n of notes) out.push({ kind: 'pnote', t: n.u, n });
  for (const b of Object.values(S.kvAll('blank')).filter(b => S.ymd(new Date(b.t)) === d)) out.push({ kind: 'blank', t: b.t, b });
  return out.sort((a, b) => a.t - b.t);
}
function entryHtml(x) {
  const time = `<span class="j-time mono">${S.fmtTime(x.t)}</span>`;
  const packName = id => { const p = D.db().byId[id]; return p ? `${subjDot(p.subject)} <a href="#/pack?id=${encodeURIComponent(id)}">${esc(p.title)}</a>` : esc(id); };
  if (x.kind === 'solve') {
    const ok = x.items.filter(e => e.r === 'ok').length, part = x.items.filter(e => e.r === 'part').length;
    const subs = [...new Set(x.items.map(e => D.db().byId[e.key.split('::')[0]]?.subject).filter(Boolean))];
    const sec = x.items.reduce((a, e) => a + Math.min(900, (e.ms || 0) / 1000), 0);
    const rows = x.items.map(e => {
      const pk = D.db().byId[e.key.split('::')[0]];
      const q = pk?.questions?.find(z => String(z.id) === e.key.split('::')[1]);
      const [cls, word] = RES[e.r] || ['', e.r];
      return `<li class="item"><a class="grow small" href="#/q?key=${encodeURIComponent(e.key)}">${esc((q?.question || e.key).slice(0, 60))}</a><span class="tag ${cls}">${word}${e.fb?.max ? ` ${e.fb.score}/${e.fb.max}` : ''}</span></li>`;
    }).join('');
    return `<li class="j-row">${time}<div class="grow"><details><summary>문제 ${x.items.length}개 풀이 · <b>${ok}</b> 맞음${part ? ` · ${part} 부분` : ''} · ${subs.map(subjName).join(', ')}${sec ? ` · ${S.fmtDur(sec)}` : ''}${x.items.some(e => e.exam) ? ' <span class="tag vio">실전</span>' : ''}</summary><ul class="list">${rows}</ul></details></div></li>`;
  }
  if (x.kind === 'cards') {
    const knew = x.items.filter(e => e.knew).length;
    const packs = [...new Set(x.items.map(e => e.key.split('::')[0]))];
    return `<li class="j-row">${time}<div class="grow">암기카드 ${x.items.length}장 · ${knew}장 알았음 · ${packs.map(packName).join(', ')}</div></li>`;
  }
  const e = x.e;
  if (x.kind === 'r') return `<li class="j-row">${time}<div class="grow">${packName(e.pack)} ${S.fmtDur(e.s)} 읽음</div></li>`;
  if (x.kind === 'm') return `<li class="j-row">${time}<div class="grow">집중 타이머 ${e.min}분</div></li>`;
  if (x.kind === 'x') return `<li class="j-row">${time}<div class="grow"><span class="tag vio">실전</span> ${e.n}문제 · ${e.ok} 맞음${e.mx ? ` · 서술형 ${e.sc}/${e.mx}점` : ''} · ${e.min}분 · ${(e.subj || []).map(subjName).join(', ')}</div></li>`;
  if (x.kind === 'q') return `<li class="j-row">${time}<div class="grow">${packName(e.pack)} 에 질문: <span class="muted">${esc(e.text)}</span></div></li>`;
  if (x.kind === 'g') return `<li class="j-row">${time}<div class="grow">AI 문제 ${e.n}개 만듦 · ${packName(e.pack)}</div></li>`;
  if (x.kind === 'hl') return `<li class="j-row">${time}<div class="grow">${packName(x.pack)} 형광펜·메모 ${x.list.length}개<ul class="small" style="margin:4px 0 0;padding-left:1.1em">${x.list.slice(0, 5).map(h => `<li><span class="hl-sw hl-${h.color}"></span> <a href="#/pack?id=${encodeURIComponent(h.pack)}${h.where ? `&src=${encodeURIComponent(h.where.slice(4))}` : ""}&mark=${h.id}">${esc(h.text.slice(0, 50))}</a>${h.note ? ` <span class="muted">✎ ${esc(h.note.slice(0, 60))}</span>` : ''}</li>`).join('')}</ul></div></li>`;
  if (x.kind === 'plan') return `<li class="j-row">${time}<div class="grow">계획 끝냄: ${x.p.subject ? subjDot(x.p.subject) + ' ' : ''}${esc(x.p.text)}</div></li>`;
  if (x.kind === 'blank') return `<li class="j-row">${time}<div class="grow">백지 복습 ${packName(x.b.pack)} · 핵심어 <b>${x.b.cov}%</b> 떠올림${x.b.miss?.length ? `<br><span class="small muted">빠진 것: ${esc(x.b.miss.slice(0, 8).join(', '))}</span>` : ''}</div></li>`;
  if (x.kind === 'pnote') return `<li class="j-row">${time}<div class="grow">${packName(x.n.pack)} 단원 메모 고침</div></li>`;
  return '';
}

function viewJournal() {
  const { q } = params();
  const log = S.getLog();
  const one = q.get('d');
  const evDays = new Set(S.getEvents().map(e => S.ymd(new Date(e.t))));
  for (const h of Object.values(S.kvAll('hl'))) evDays.add(S.ymd(new Date(h.c)));
  for (const id in S.kvAll('diary')) evDays.add(id);
  evDays.add(S.today());
  let days = [...evDays].sort().reverse();
  const limit = Number(q.get('n') || 7);
  if (one) days = [one];
  const shown = days.slice(0, limit);
  main.innerHTML = `
  <div class="row between"><h1 style="margin:0">공부 일지</h1>${one ? '<a class="btn sm" href="#/journal">전체 날짜</a>' : '<a class="btn sm ghost" href="#/stats">그래프</a>'}</div>
  <p class="small muted">공부한 흔적이 날짜별로 쌓인다. 하루 끝에 한 줄 회고를 남겨 두면 시험 전에 다시 볼 수 있다.</p>
  ${shown.map(d => {
    const l = log[d] || {};
    const list = dayEntries(d);
    const diary = S.kvGet('diary', d);
    const exD = examInfo().days.includes(d);
    return `<section class="card j-day">
      <div class="row between"><h2 style="margin:0">${S.fmtDate(d)} ${d === S.today() ? '<span class="tag ok">오늘</span>' : ''}${exD ? '<span class="tag bad">시험일</span>' : ''}</h2><span class="small muted">${dLabel(examInfo().first) && d <= examInfo().first ? `시험 ${S.daysBetween(d, examInfo().first)}일 전` : ''}</span></div>
      <div class="j-sum small">
        <span><b>${S.fmtDur(S.studySec(l))}</b> 공부</span>
        <span><b>${l.q || 0}</b> 문제 ${l.q ? `(${pct(l.ok, l.q)}%)` : ''}</span>
        <span><b>${l.c || 0}</b> 카드</span>
        <span><b>${S.fmtDur(l.read || 0)}</b> 읽기</span>
        ${l.min ? `<span><b>${l.min}분</b> 타이머</span>` : ''}
      </div>
      ${list.length ? `<ul class="j-list">${list.map(entryHtml).join('')}</ul>` : '<p class="small muted">기록이 없다.</p>'}
      <label class="field"><span>한 줄 회고</span><textarea class="diary" data-day="${d}" rows="2" style="min-height:56px" placeholder="오늘 잘된 것, 헷갈린 것, 내일 할 것">${esc(diary?.text || '')}</textarea></label>
    </section>`;
  }).join('')}
  ${!one && days.length > limit ? `<a class="btn block" href="#/journal?n=${limit + 14}">이전 날짜 더 보기</a>` : ''}`;
  $$('textarea.diary').forEach(t => {
    let tm = null;
    t.addEventListener('input', () => {
      clearTimeout(tm);
      tm = setTimeout(() => { if (t.value.trim()) S.kvSet('diary', t.dataset.day, { text: t.value }); else S.kvDel('diary', t.dataset.day); }, 700);
    });
  });
}

// ================= 형광펜·메모 모아보기 =================
function viewMarks() {
  const { q } = params();
  const fs = q.get('s') || '', fc = q.get('c') || '', fp = q.get('pack') || '', term = (q.get('q') || '').trim().toLowerCase();
  let list = Object.values(S.kvAll('hl'));
  if (fs) list = list.filter(h => h.subject === fs);
  if (fc) list = list.filter(h => h.color === fc);
  if (fp) list = list.filter(h => h.pack === fp);
  if (q.get('memo')) list = list.filter(h => h.note);
  if (term) list = list.filter(h => (h.text + ' ' + (h.note || '')).toLowerCase().includes(term));
  const notes = Object.values(S.kvAll('pnote')).filter(n => (!fs || D.db().byId[n.pack]?.subject === fs) && (!fp || n.pack === fp));
  const order = D.db().packs.map(p => p.id);
  const byPack = {};
  for (const h of list) (byPack[h.pack] = byPack[h.pack] || []).push(h);
  const packs = Object.keys(byPack).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const link = patch => { const p = new URLSearchParams(q); for (const k in patch) { if (patch[k]) p.set(k, patch[k]); else p.delete(k); } return '#/marks' + (p.toString() ? '?' + p : ''); };
  main.innerHTML = `
  <h1>형광펜·메모 모아보기</h1>
  <p class="small muted">시험 직전에 내가 칠한 곳과 메모만 훑어본다.</p>
  <form id="mf" class="row" style="margin:8px 0"><input type="search" name="q" placeholder="형광펜·메모에서 찾기" value="${esc(q.get('q') || '')}" style="flex:1"><button class="btn">찾기</button></form>
  <div class="chips" style="margin-bottom:6px"><a class="chip${!fs ? ' on' : ''}" href="${link({ s: '' })}">전체</a>${SUBJECTS.map(s => `<a class="chip${fs === s.id ? ' on' : ''}" href="${link({ s: s.id })}">${subjDot(s.id)}${s.name}</a>`).join('')}</div>
  <div class="chips" style="margin-bottom:12px"><a class="chip${!fc ? ' on' : ''}" href="${link({ c: '' })}">모든 색</a>${HL.COLORS.map(c => `<a class="chip${fc === c.id ? ' on' : ''}" href="${link({ c: c.id })}"><span class="hl-sw hl-${c.id}"></span>${c.name}</a>`).join('')}<a class="chip${q.get('memo') ? ' on' : ''}" href="${link({ memo: q.get('memo') ? '' : '1' })}">메모 있는 것만</a>${fp ? `<a class="chip on" href="${link({ pack: '' })}">${esc(D.db().byId[fp]?.title || fp)} ✕</a>` : ''}</div>
  ${notes.length && !fc && !term ? `<section class="card flat"><h2>단원 메모</h2>${notes.map(n => `<p><a href="#/pack?id=${encodeURIComponent(n.pack)}"><b>${esc(D.db().byId[n.pack]?.title || n.pack)}</b></a><br><span style="white-space:pre-wrap">${esc(n.text)}</span></p>`).join('')}</section>` : ''}
  ${packs.map(pk => {
    const p = D.db().byId[pk];
    return `<section class="card flat"><h2>${p ? subjDot(p.subject) + ' ' + esc(p.title) : esc(pk)}</h2><ul class="list">${byPack[pk].sort((a, b) => a.c - b.c).map(h => `<li class="item" style="align-items:flex-start"><span class="grow"><a class="hl-text hl-${h.color}" href="#/pack?id=${encodeURIComponent(h.pack)}${h.where ? `&src=${encodeURIComponent(h.where.slice(4))}` : ""}&mark=${h.id}">${esc(h.text)}</a>${h.note ? `<br><span class="small">✎ ${esc(h.note)}</span>` : ''}</span><span class="small muted">${S.fmtDate(S.ymd(new Date(h.c)))}</span></li>`).join('')}</ul></section>`;
  }).join('') || '<p class="muted">아직 없다. 자료 본문에서 글자를 길게 눌러 골라 본다.</p>'}`;
  $('#mf').addEventListener('submit', e => { e.preventDefault(); location.hash = link({ q: e.target.q.value.trim() }); });
}

// ================= 문제 하나의 기록 =================
function viewQuestion() {
  const { q } = params();
  const key = q.get('key') || '';
  const [pid, qid] = key.split('::');
  const pack = D.db().byId[pid];
  const qq = pack?.questions?.find(z => String(z.id) === qid);
  if (!qq) { main.innerHTML = '<p class="muted">문제를 찾지 못했다. 자료가 바뀌었을 수 있다.</p>'; return; }
  const it = { pack, q: qq, key };
  const past = S.attemptsOf(key);
  const pr = S.qp(key);
  let right = '';
  if (qq.type === 'mcq') right = (Array.isArray(qq.answer) ? qq.answer : [qq.answer]).map(n => `${'①②③④⑤⑥'[n - 1]} ${esc(qq.choices[n - 1])}`).join('<br>');
  if (qq.type === 'short') right = qq.answers.map(esc).join(' / ');
  if (qq.type === 'essay') right = `<span style="white-space:pre-wrap">${esc(qq.model_answer)}</span>`;
  const last = [...past].reverse().find(e => e.fb?.improved);
  main.innerHTML = `
  <p class="small"><a href="#/pack?id=${encodeURIComponent(pid)}">← ${esc(pack.title)}</a></p>
  <section class="card">
    <div class="q-head">${subjDot(pack.subject)}<span class="tag">${TYPE_NAME[qq.type]}</span>${pr ? `<span class="tag">${pr.ok}/${pr.n} 맞음</span>${pr.wrong ? '<span class="tag bad">오답노트</span>' : ''}${pr.star ? '<span class="tag warn">★</span>' : ''}${pr.due ? `<span class="tag">다음 복습 ${pr.due.slice(5).replace('-', '/')}</span>` : ''}` : ''}</div>
    ${qq.context ? `<div class="q-ctx">${esc(qq.context)}</div>` : ''}
    <div class="q-text">${esc(qq.question)}</div>
    ${qq.type === 'mcq' ? `<ol class="small">${qq.choices.map(c => `<li>${esc(c)}</li>`).join('')}</ol>` : ''}
    <details><summary>정답과 해설</summary><p>${right}</p>${qq.explanation ? `<p class="small">${esc(qq.explanation)}</p>` : ''}</details>
    <div class="row" style="margin-top:10px"><button class="btn pri" id="again">다시 풀기</button></div>
  </section>
  <section class="card"><h2>풀이 이력 ${past.length}번</h2>${past.length ? attemptList(it, [...past].reverse()) : '<p class="muted small">아직 안 풀었다.</p>'}</section>
  ${last ? `<section class="card"><h2>AI 가 고쳐 준 답 (마지막)</h2><p style="white-space:pre-wrap">${esc(last.fb.improved)}</p></section>` : ''}`;
  $('#again').addEventListener('click', () => startSession([it], 'practice'));
}

// ================= 설정·가져오기 =================
let pendingImport = null;
function viewSettings() {
  const s = AI.settings();
  const localList = D.localPacks();
  const sc = SYNC.conf();
  const st = SYNC.getStatus();
  main.innerHTML = `
  <h1>설정</h1>
  <section class="card" id="import">
    <h2>자료 가져오기</h2>
    <p class="small muted">공부자료 Claude 가 준 JSON 을 통째로 붙여넣거나 .json 파일을 고른다. 가져온 자료는 이 기기에 저장되고, 기록 동기화를 켜 두면 다른 기기에도 들어간다.</p>
    <textarea id="impText" placeholder='{ "format": "study-hub/1", "id": "...", ... }' style="min-height:140px;font-family:var(--mono);font-size:.85rem"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn" id="impCheck">검사</button><label class="btn ghost">파일 고르기<input type="file" id="impFile" accept=".json,application/json,text/plain" multiple hidden></label></div>
    <div id="impOut"></div>
  </section>

  ${localList.length ? `<section class="card"><h2>이 기기에 가져온 자료 ${localList.length}개</h2><ul class="list">${localList.map(p => `<li class="item">${subjDot(p.subject)}<span class="grow">${esc(p.title)}<br><span class="small muted">${esc(p.id)} · 문제 ${(p.questions || []).length} · 카드 ${(p.cards || []).length}</span></span><button class="btn sm ghost" data-copy="${esc(p.id)}">JSON 복사</button><button class="btn sm bad" data-del="${esc(p.id)}">지우기</button></li>`).join('')}</ul>
  <p class="small muted">"JSON 복사" 한 내용을 저장소 data/packs/과목/ 에 파일로 올리면 모든 기기에서 보인다.</p></section>` : ''}

  <section class="card" id="sync">
    <h2>기록 동기화 (GitHub 비공개 Gist)</h2>
    <p class="small">푼 기록, 풀이 이력, 공부 일지, 형광펜·메모, 계획, 가져온 자료를 내 GitHub 의 <b>비공개 Gist</b> 에 쌓는다. 태블릿·휴대폰·컴퓨터에서 같은 토큰을 넣으면 기록이 합쳐진다. 지우는 일이 없어서 두 기기에서 동시에 공부해도 기록이 사라지지 않는다. API 키와 토큰은 올라가지 않는다.</p>
    ${SYNC.isOn() ? `
      <p>연결됨: <b>${esc(sc.login || '')}</b> · <a href="${SYNC.gistUrl()}" target="_blank" rel="noopener">Gist 보기</a></p>
      <p class="small" id="syncState">${syncText(st)}</p>
      <label class="row small"><input type="checkbox" id="syncAuto"${sc.auto ? ' checked' : ''}> 자동 동기화 (기록이 생기면 15초 뒤, 앱을 다시 열 때, 10분마다)</label>
      <div class="row" style="margin-top:8px"><button class="btn pri" id="syncNow">지금 동기화</button><button class="btn ghost bad" id="syncOff">연결 끊기</button></div>
    ` : `
      <details${sc.gistId ? ' open' : ''}><summary>토큰 만드는 법</summary><ol class="small">
        <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a> 를 연다 (Fine-grained token).</li>
        <li>Token name: <code>study-hub</code>, Expiration: 시험 뒤 날짜 (예: 2027-01-31).</li>
        <li>Repository access 는 "Public repositories" 그대로 둔다.</li>
        <li><b>Account permissions → Gists → Read and write</b> 로 바꾼다. 다른 권한은 주지 않는다.</li>
        <li>Generate token 을 눌러 나온 <code>github_pat_...</code> 를 아래에 붙여넣는다.</li>
      </ol><p class="small muted">이 토큰은 Gist 만 다룰 수 있다. 공용 기기에는 넣지 않는다. 기기마다 같은 토큰을 넣으면 된다.</p></details>
      <label class="field"><span>GitHub 토큰</span><input type="password" id="ghToken" placeholder="github_pat_..." autocomplete="off"></label>
      <button class="btn pri" id="syncConnect">연결하고 동기화</button>
      ${sc.gistId ? '<p class="small muted">전에 연결했던 Gist 가 있다. 토큰을 다시 넣으면 그 Gist 를 이어서 쓴다.</p>' : ''}
    `}
  </section>

  <section class="card">
    <h2>AI 채점 (Claude API)</h2>
    <p class="small">서술형 채점, 단답형 유사 답 확인, 자료 질문, 문제 만들기에 쓴다. 키는 <b>이 기기의 브라우저에만</b> 저장되고, 요청은 이 브라우저에서 Anthropic 으로 바로 간다. 키는 <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> 에서 만든다. 쓴 만큼 요금이 나온다.</p>
    <label class="field"><span>API 키</span><input type="password" id="apiKey" value="${esc(s.apiKey)}" placeholder="sk-ant-..." autocomplete="off"></label>
    <label class="field"><span>모델</span><select id="model">${AI.MODELS.map(m => `<option value="${m.id}"${m.id === s.model ? ' selected' : ''}>${m.name} — ${m.note}</option>`).join('')}</select></label>
    <div class="row"><button class="btn pri" id="saveKey">저장</button><button class="btn" id="testKey">연결 확인</button><button class="btn ghost" id="showKey">키 보기</button>${s.apiKey ? '<button class="btn bad ghost" id="delKey">키 지우기</button>' : ''}</div>
    <p class="small muted" style="margin-top:8px">공용 컴퓨터에서는 키를 넣지 않는다. 키가 새어 나간 것 같으면 콘솔에서 바로 지운다.</p>
  </section>

  <section class="card">
    <h2>백업</h2>
    <p class="small muted">기록 전체를 파일로 받는다. 동기화를 쓰더라도 시험 전에 한 번씩 받아 두면 안전하다. 불러오면 지금 기록에 합쳐진다 (덮어쓰지 않는다). API 키와 토큰은 들어가지 않는다.</p>
    <p class="small">이 기기에 쌓인 기록 ${S.getEvents().length.toLocaleString()}건 · 저장 공간 ${(S.storageBytes() / 1048576).toFixed(2)}MB / 약 5MB</p>
    <p class="small muted">사이트 버전 ${esc(window.SH_VERSION || '-')} · <span id="offState">오프라인 모드 확인 중</span> <button class="btn sm ghost" id="updBtn">새 버전 확인</button></p>
    <div class="row"><button class="btn" id="exp">백업 파일 받기</button><label class="btn">백업 불러오기<input type="file" id="impBk" accept=".json" hidden></label><button class="btn bad ghost" id="reset">기록 초기화</button></div>
  </section>`;

  // 가져오기
  const out = $('#impOut');
  const check = text => {
    try {
      const r = D.parseImport(text);
      const bad = new Set(r.errors.map(m => m.split(':')[0]));
      const okPacks = r.packs.filter((p, i) => !bad.has(p && p.id ? p.id : `packs[${i}]`));
      const tp = (r.textPatches || []).filter(t => typeof t.texts_for === 'string' && Array.isArray(t.texts) && t.texts.every(x => x && typeof x.body === 'string' && x.body.trim()));
      const pl = r.plan && !r.errors.some(m => m.startsWith('공부 계획')) ? r.plan : null;
      const plCount = pl ? pl.weeks.reduce((a, w) => a + w.groups.reduce((b, g) => b + (g.items || []).length, 0), 0) : 0;
      pendingImport = { packs: okPacks, exam: r.exam, textPatches: tp, plan: pl };
      out.innerHTML = `<div class="${r.errors.length ? 'note' : 'note info'}" style="margin-top:10px">
        <p>${r.packs.length ? `자료 ${r.packs.length}개 중 ${okPacks.length}개 가져올 수 있다.` : ''}${tp.length ? ` 원문 ${tp.reduce((a, t) => a + t.texts.length, 0)}개 (${tp.map(t => esc(D.db().byId[t.texts_for]?.title || t.texts_for + ' (없는 자료)')).join(', ')}).` : ''}${r.exam ? ' 시험 정보도 들어 있다.' : ''}${pl ? ` 공부 계획 ${pl.weeks.length}주, 할 일 ${plCount}개 (지금 있는 계획을 바꾼다. 체크한 것은 그대로).` : ''}</p>
        ${okPacks.map(p => `<div class="small">${subjDot(p.subject)} ${esc(p.title)} · 문제 ${(p.questions || []).length} · 카드 ${(p.cards || []).length}${D.db().byId[p.id] ? ' <span class="tag warn">같은 id 덮어씀</span>' : ''}</div>`).join('')}
        ${r.errors.length ? `<details open><summary>고칠 것 ${r.errors.length}개</summary><ul class="small">${r.errors.slice(0, 30).map(m => `<li>${esc(m)}</li>`).join('')}</ul><p class="small">이 목록을 공부자료 Claude 에게 보내고 고쳐 달라고 하면 된다.</p></details>` : ''}
        ${okPacks.length || r.exam || tp.length || pl ? '<button class="btn pri" id="impGo" style="margin-top:8px">가져오기</button>' : ''}
      </div>`;
      $('#impGo')?.addEventListener('click', async () => {
        if (pendingImport.packs.length) D.saveLocalPacks(pendingImport.packs);
        if (pendingImport.plan) D.savePlan(pendingImport.plan);
        for (const tp2 of pendingImport.textPatches || []) tp2.texts.forEach((t, i) => SRC.saveText({ id: tp2.texts_for }, t.id ? String(t.id) : 'add-' + i, t.title || `본문 ${i + 1}`, t.body));
        if (pendingImport.exam && pendingImport.exam.subjects) {
          const sub = {};
          for (const id in pendingImport.exam.subjects) if (SUBJ[id]) { const v = pendingImport.exam.subjects[id]; sub[id] = {}; if ('date' in v) sub[id].date = v.date; if ('range' in v) sub[id].range = v.range; }
          D.saveExamLocal(sub);
        }
        await D.loadAll();
        toast(pendingImport.plan && !pendingImport.packs.length ? '공부 계획을 가져왔다. 시험 일정과 계획 화면에서 보인다.' : `자료 ${pendingImport.packs.length}개${(pendingImport.textPatches || []).length ? `, 원문 ${pendingImport.textPatches.length}묶음` : ''} 가져왔다.`);
        pendingImport = null;
        render();
      });
    } catch (err) {
      out.innerHTML = `<p class="note" style="margin-top:10px">${esc(err.message)}</p>`;
    }
  };
  $('#impCheck').addEventListener('click', () => check($('#impText').value));
  $('#impFile').addEventListener('change', async e => {
    const files = [...e.target.files];
    const texts = await Promise.all(files.map(f => f.text()));
    // 파일 여러 개면 묶어서 검사한다
    if (texts.length === 1) { $('#impText').value = texts[0]; return check(texts[0]); }
    try {
      const packs = [];
      for (const t of texts) { const r = D.parseImport(t); packs.push(...r.packs); }
      const merged = JSON.stringify({ packs });
      $('#impText').value = merged;
      check(merged);
    } catch (err) { out.innerHTML = `<p class="note">${esc(err.message)}</p>`; }
  });
  $$('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('이 자료를 이 기기에서 지울까? 푼 기록은 남는다.')) return;
    D.deleteLocalPack(b.dataset.del); await D.loadAll(); render.keepScroll = true; render();
  }));
  $$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    const p = D.localPacks().find(x => x.id === b.dataset.copy);
    try { await navigator.clipboard.writeText(JSON.stringify(p, null, 2)); toast('복사했다.'); } catch (e) { toast('복사하지 못했다.'); }
  }));

  // API 키
  const saveSettings = () => { S.save('settings', { ...AI.settings(), apiKey: $('#apiKey').value.trim(), model: $('#model').value }); };
  $('#saveKey').addEventListener('click', () => { saveSettings(); toast('저장했다.'); render.keepScroll = true; render(); });
  $('#model').addEventListener('change', saveSettings);
  $('#showKey').addEventListener('click', () => { const i = $('#apiKey'); i.type = i.type === 'password' ? 'text' : 'password'; });
  $('#delKey')?.addEventListener('click', () => { S.save('settings', { ...AI.settings(), apiKey: '' }); toast('키를 지웠다.'); render.keepScroll = true; render(); });
  $('#testKey').addEventListener('click', async e => {
    saveSettings();
    const b = e.target; b.disabled = true; b.innerHTML = '<span class="spin"></span> 확인 중';
    try { const t = await AI.testKey(); toast('연결됐다: ' + t.slice(0, 30), 3000); } catch (err) { toast(err.message, 5000); }
    b.disabled = false; b.textContent = '연결 확인';
  });

  $('#updBtn').addEventListener('click', () => checkUpdate(true));
  (async () => {
    const el = $('#offState');
    try {
      const c = await caches.open('study-hub');
      const n = (await c.keys()).length;
      const ok = !!(await c.match(new URL('js/app.js', location.href).origin + new URL('js/app.js', location.href).pathname) || await c.match('js/app.js', { ignoreSearch: true }));
      if (el) el.textContent = ok ? `오프라인 모드 준비됨 (파일 ${n}개 저장)` : '오프라인 모드 준비 중 (인터넷 연결 상태로 한 번 새로고침)';
    } catch (e) { if (el) el.textContent = '이 브라우저는 오프라인 모드를 지원하지 않는다'; }
  })();
  // 백업
  $('#exp').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S.exportAll())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `study-hub-백업-${S.today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#impBk').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      S.importAll(JSON.parse(await f.text()));
      await D.loadAll();
      toast('불러와서 합쳤다.');
      render();
    } catch (err) { toast(err.message, 4000); }
  });
  $('#reset').addEventListener('click', () => {
    if (SYNC.isOn()) return toast('동기화 중에는 지워도 Gist 에서 다시 돌아온다. 먼저 연결을 끊는다.', 4500);
    if (!confirm('이 기기의 푼 기록, 풀이 이력, 카드·읽기·타이머 기록을 모두 지울까? 자료, 계획, 형광펜·메모, API 키는 남는다.')) return;
    S.resetProgress(); toast('지웠다.'); render();
  });

  // 동기화
  $('#syncConnect')?.addEventListener('click', async e => {
    const tok = $('#ghToken').value.trim();
    if (!tok) return toast('토큰을 붙여넣는다.');
    const b = e.target; b.disabled = true; b.innerHTML = '<span class="spin"></span> 연결 중';
    try { const r = await SYNC.connect(tok); toast(`${r.login} 의 Gist 에 연결했다.`); await D.loadAll(); render(); }
    catch (err) { toast(err.message, 5000); b.disabled = false; b.textContent = '연결하고 동기화'; }
  });
  $('#syncNow')?.addEventListener('click', async e => {
    const b = e.target; b.disabled = true; b.innerHTML = '<span class="spin"></span> 동기화 중';
    await SYNC.syncNow();
    const st2 = SYNC.getStatus();
    toast(st2.state === 'ok' ? '동기화했다.' : st2.msg, 4000);
    b.disabled = false; b.textContent = '지금 동기화';
  });
  $('#syncAuto')?.addEventListener('change', e => SYNC.setAuto(e.target.checked));
  $('#syncOff')?.addEventListener('click', () => {
    if (!confirm('이 기기에서 동기화를 끊을까? 이 기기와 Gist 의 기록은 그대로 남는다.')) return;
    SYNC.disconnect(); render();
  });
}

function syncText(st) {
  if (st.state === 'busy') return '<span class="spin"></span> 동기화 중';
  if (st.state === 'error') return `<span style="color:var(--bad)">동기화 실패: ${esc(st.msg)}</span>`;
  if (st.state === 'dirty') return '올릴 기록이 있다. 곧 동기화한다.';
  if (st.at) return `마지막 동기화 ${S.fmtDate(S.ymd(new Date(st.at)))} ${S.fmtTime(st.at)}`;
  return '';
}

// ================= 공부자료 Claude 프롬프트 =================
function viewPrompts() {
  const { q } = params();
  const sel = q.get('s') || 'kor';
  const light = q.get('v') === 'light';
  const text = PR.chatPrompt(sel, { light });
  main.innerHTML = `
  <h1>공부자료 Claude 에게 보낼 프롬프트</h1>
  <ol class="small" style="padding-left:1.2em">
    <li>과목을 고르고 "복사" 를 누른다.</li>
    <li>그 과목 공부자료를 만든 Claude 채팅에 붙여넣어 보낸다.</li>
    <li>Claude 가 목차를 보여주면 확인하고 "시작" 이라고 보낸다.</li>
    <li>JSON 이 오면 코드 블록 오른쪽 위 복사 버튼으로 복사해서 <a href="#/settings">설정 → 자료 가져오기</a> 에 붙여넣고 "검사" → "가져오기".</li>
    <li>Claude 에게 "다음" 이라고 보내고 4번을 되풀이한다.</li>
  </ol>
  ${chipGroup('pv', [{ value: '', label: '기본' }, { value: 'light', label: '가벼운 버전 (사용량 적게)' }], [light ? 'light' : ''], false)}
  <p class="small muted" style="margin:6px 0 10px">${light ? '자료마다 객관식 5 · 단답형 3 · 서술형 1, 카드 10~20장. 이미 정리한 내용은 새로 쓰지 않고 옮기기만 한다. Sonnet 이나 Haiku 로 써도 된다. 문제가 모자라면 나중에 "AI 문제 만들기" 로 더 받는다.' : '자료마다 객관식 8~15 · 단답형 4~8 · 서술형 2~4, 카드는 많이. 답이 길어서 사용량이 많다.'}</p>
  ${chipGroup('ps', SUBJECTS.map(s => ({ value: s.id, label: s.name, dot: true })), [sel], false)}
  <section class="card" style="margin-top:12px">
    <div class="row between"><h2 style="margin:0">${subjName(sel)}${light ? ' · 가벼운 버전' : ''}</h2><button class="btn pri" data-copy-text="main">복사</button></div>
    <pre class="prompt" id="ptext">${esc(text)}</pre>
  </section>
  <section class="card"><div class="row between"><h2 style="margin:0">이미 만든 자료에 원문만 더 받을 때</h2><button class="btn sm" data-copy-text="texts">복사</button></div><p class="small muted">그 과목 Claude 채팅에 보낸다. 받은 JSON 을 자료 가져오기에 붙여넣으면 문제와 기록은 그대로 두고 원문만 붙는다.</p><pre class="prompt">${esc(PR.TEXTS_PROMPT)}</pre></section>
  <section class="card"><div class="row between"><h2 style="margin:0">오류가 났을 때</h2><button class="btn sm" data-copy-text="fix">복사</button></div><pre class="prompt">${esc(PR.FIX_PROMPT)}</pre></section>
  <section class="card"><div class="row between"><h2 style="margin:0">시험 범위·날짜가 나왔을 때</h2><button class="btn sm" data-copy-text="range">복사</button></div><pre class="prompt">${esc(PR.RANGE_PROMPT)}</pre></section>`;
  $$('input[name="ps"]').forEach(r => r.addEventListener('change', () => { location.hash = '#/prompts?s=' + r.value + (light ? '&v=light' : ''); }));
  $$('input[name="pv"]').forEach(r => r.addEventListener('change', () => { location.hash = '#/prompts?s=' + sel + (r.value ? '&v=light' : ''); }));
  const texts = { main: text, fix: PR.FIX_PROMPT, range: PR.RANGE_PROMPT, texts: PR.TEXTS_PROMPT };
  $$('[data-copy-text]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(texts[b.dataset.copyText]); toast('복사했다. Claude 채팅에 붙여넣는다.'); }
    catch (e) {
      const pre = b.closest('section').querySelector('pre');
      const r = document.createRange(); r.selectNodeContents(pre);
      const sel2 = getSelection(); sel2.removeAllRanges(); sel2.addRange(r);
      toast('자동 복사가 막혔다. 선택된 글을 길게 눌러 복사한다.', 4000);
    }
  }));
}

// ================= 백지 복습 =================
// 서울대생 "백지 공부법" + 파인만 기법: 자료를 덮고 기억나는 것을 다 쓴 뒤, 자료와 비교해 빠진 것을 찾는다.
let blank = null;
function keywordsOf(p) {
  const out = new Set();
  const notes = p.notes || '';
  for (const m of notes.matchAll(/\*\*([^*\n]{2,40})\*\*/g)) out.add(m[1].trim());
  for (const m of notes.matchAll(/<mark>([^<\n]{2,40})<\/mark>/g)) out.add(m[1].trim());
  for (const m of notes.matchAll(/^#{2,4}\s+(.{2,30})$/gm)) out.add(m[1].replace(/[*`]/g, '').trim());
  for (const c of p.cards || []) if (c.front.length <= 20) out.add(c.front.trim());
  return [...out].filter(k => k && !/^[\d\s.()·-]+$/.test(k)).slice(0, 80);
}
const nk = s => String(s).normalize('NFKC').toLowerCase().replace(/[\s.,·'"‘’“”()\[\]「」『』<>:;!?~-]/g, '');

function viewBlank() {
  const { q } = params();
  const id = q.get('pack');
  const p = id && D.db().byId[id];
  if (!p) {
    const packs = D.db().packs.filter(x => x.notes);
    const hist = Object.values(S.kvAll('blank')).sort((a, b) => b.t - a.t).slice(0, 10);
    main.innerHTML = `<h1>백지 복습</h1>
    <p class="small muted">자료를 덮고 그 단원에서 기억나는 것을 빈 종이에 쓰듯 다 써 본다. 그다음 자료와 비교해서 빠진 핵심어를 찾는다. 읽기만 하는 것보다 오래 남는다 (인출 연습).</p>
    <section class="card flat"><ul class="list">${packs.map(x => `<li><a class="item" href="#/blank?pack=${encodeURIComponent(x.id)}">${subjDot(x.subject)}<span class="grow">${esc(x.title)}</span><span class="small muted">핵심어 ${keywordsOf(x).length}</span></a></li>`).join('') || '<li class="item muted">본문이 있는 자료가 없다.</li>'}</ul></section>
    ${hist.length ? `<h2>최근 백지 복습</h2><section class="card flat"><ul class="list">${hist.map(h => `<li class="item"><span class="grow">${esc(D.db().byId[h.pack]?.title || h.pack)}<br><span class="small muted">${S.fmtDate(S.ymd(new Date(h.t)))} ${S.fmtTime(h.t)}</span></span><span class="tag ${h.cov >= 70 ? 'ok' : h.cov >= 40 ? 'warn' : 'bad'}">${h.cov}%</span></li>`).join('')}</ul></section>` : ''}`;
    return;
  }
  if (!blank || blank.pack !== p.id) blank = { pack: p.id, text: '', phase: 'write', start: Date.now() };
  const kws = keywordsOf(p);
  if (blank.phase === 'write') {
    main.innerHTML = `<p class="small"><a href="#/pack?id=${encodeURIComponent(p.id)}">← ${esc(p.title)}</a></p>
    <h1>백지 복습 · ${esc(p.title)}</h1>
    <p class="small muted">자료를 보지 않고 이 단원에서 기억나는 것을 전부 쓴다. 개념, 순서, 예시, 헷갈리는 것까지. 남에게 설명하듯 쓰면 더 좋다 (파인만 기법). 핵심어 ${kws.length}개와 비교한다.</p>
    <section class="card"><div class="row between"><b>빈 종이</b><span class="timer" id="bTimer"></span></div>
      <textarea id="bText" style="min-height:50vh;margin-top:8px" placeholder="생각나는 대로 다 쓴다.">${esc(blank.text)}</textarea>
      <div class="row" style="margin-top:10px"><button class="btn pri" id="bDone">다 썼다 → 자료와 비교</button><span class="small muted" id="bLen"></span></div></section>`;
    const ta = $('#bText');
    const upd = () => { blank.text = ta.value; $('#bLen').textContent = `${ta.value.replace(/\s/g, '').length}자`; };
    ta.addEventListener('input', upd); upd(); ta.focus();
    clearInterval(viewBlank._t);
    const tick = () => { const el = document.getElementById('bTimer'); if (!el) return clearInterval(viewBlank._t); const sec = Math.floor((Date.now() - blank.start) / 1000); el.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
    tick(); viewBlank._t = setInterval(tick, 1000);
    $('#bDone').addEventListener('click', () => {
      if (blank.text.replace(/\s/g, '').length < 10) return toast('조금 더 써 본다. 생각나는 단어만이라도.');
      const mine = nk(blank.text);
      const hit = kws.filter(k => mine.includes(nk(k)));
      blank.hit = hit; blank.miss = kws.filter(k => !hit.includes(k));
      blank.cov = kws.length ? Math.round(hit.length / kws.length * 100) : 0;
      blank.phase = 'compare';
      const t = Date.now();
      S.kvSet('blank', 'b' + t.toString(36), { pack: p.id, text: blank.text, cov: blank.cov, miss: blank.miss.slice(0, 40), t, sec: Math.round((t - blank.start) / 1000) });
      S.recordRead(p.id, Math.min(1800, (t - blank.start) / 1000));
      viewBlank();
    });
    return;
  }
  // 비교
  let notesHtml = md(p.notes);
  main.innerHTML = `<p class="small"><a href="#/pack?id=${encodeURIComponent(p.id)}">← ${esc(p.title)}</a></p>
  <h1>백지 복습 결과</h1>
  <section class="grid" style="margin-bottom:12px">
    <div class="stat"><b>${blank.cov}%</b><span>핵심어를 떠올림</span></div>
    <div class="stat"><b>${blank.hit.length}/${kws.length}</b><span>쓴 핵심어</span></div>
    <div class="stat"><b>${blank.miss.length}</b><span>빠진 핵심어</span></div>
  </section>
  ${blank.miss.length ? `<section class="card flat"><h2>빠진 핵심어</h2><div class="chips">${blank.miss.map(k => `<span class="chip" style="border-color:var(--bad);color:var(--bad)">${esc(k)}</span>`).join('')}</div><p class="small muted" style="margin-top:8px">오른쪽 자료에서 빨간 밑줄로 표시했다. 이것만 다시 읽고 내일 한 번 더 백지 복습을 한다.</p></section>` : '<p class="note info">핵심어를 다 떠올렸다.</p>'}
  <div class="grid2">
    <section class="card"><h2>내가 쓴 것</h2><p style="white-space:pre-wrap">${esc(blank.text)}</p></section>
    <section class="card notes" id="bNotes">${notesHtml}</section>
  </div>
  <section class="card"><h2>설명이 맞는지 Claude 에게 확인 (파인만 기법)</h2>
    <p class="small muted">빠진 것뿐 아니라 내가 잘못 알고 쓴 것까지 찾아 준다.</p>
    <div class="row">${AI.hasKey() ? '<button class="btn pri" id="bAi">AI 피드백 받기</button>' : ''}<button class="btn${AI.hasKey() ? '' : ' pri'}" id="bCopy">채팅용 요청 복사 (무료)</button><a class="btn ghost" href="https://claude.ai/new" target="_blank" rel="noopener">claude.ai 열기</a></div>
    <pre class="prompt" id="bPre" hidden></pre><div id="bFb" class="notes"></div></section>
  <div class="row"><button class="btn" id="bAgain">다시 쓰기</button><a class="btn ghost" href="#/blank">다른 자료</a></div>`;
  const root = $('#bNotes');
  for (const k of blank.miss) {
    const full = root.textContent; const i = full.indexOf(k);
    if (i >= 0) HL.paint(root, [{ id: 'miss-' + k, text: k, prefix: full.slice(Math.max(0, i - 10), i), suffix: '', color: 'p', c: 0 }]);
  }
  root.querySelectorAll('mark.hl').forEach(m => { m.className = 'miss'; });
  const prompt = `내가 "${p.title}" 단원을 공부하고, 자료를 안 보고 기억나는 것을 다 써 봤어. 아래 공부자료와 비교해서 알려줘.
1. 내가 잘못 알고 쓴 것 (틀린 설명) — 가장 중요
2. 빠뜨린 핵심 개념
3. 내 설명에서 애매하거나 연결이 끊긴 곳
반말로 짧게, 목록으로. 칭찬은 빼고.

[공부자료]
${(p.notes || '').slice(0, 30000)}

[내가 쓴 것]
${blank.text}`;
  $('#bCopy').addEventListener('click', () => copyText(prompt, $('#bPre')));
  $('#bAi')?.addEventListener('click', async e => {
    const b = e.target; b.disabled = true; b.innerHTML = '<span class="spin"></span> 확인 중';
    try { const a = await AI.askAboutPack(p, prompt, []); $('#bFb').innerHTML = md(a); }
    catch (err) { toast(err.message, 4500); }
    b.disabled = false; b.textContent = 'AI 피드백 받기';
  });
  $('#bAgain').addEventListener('click', () => { blank = { pack: p.id, text: '', phase: 'write', start: Date.now() }; viewBlank(); });
}

// ================= 시험 전 정리 =================
function viewFinal() {
  const { q } = params();
  const sel = q.get('s') || '';
  if (!sel) {
    main.innerHTML = `<h1>시험 전 정리</h1><p class="small muted">시험 전날·당일 아침에 볼 한 장. 내가 쓴 단원 메모, 형광펜·메모, 오답, 헷갈린 문제, 모르는 카드만 모은다.</p>
    <section class="card flat"><ul class="list">${SUBJECTS.map(s => { const d = subjDate(s.id); return `<li><a class="item" href="#/final?s=${s.id}">${subjDot(s.id)}<span class="grow">${s.name}</span><span class="small muted">${d ? `${S.fmtDate(d)} · ${dLabel(d)}` : '날짜 미정'}</span></a></li>`; }).join('')}</ul></section>`;
    return;
  }
  const packs = D.db().packs.filter(p => p.subject === sel);
  const ids = new Set(packs.map(p => p.id));
  const prog = S.getProgress();
  const notes = Object.values(S.kvAll('pnote')).filter(n => ids.has(n.pack));
  const hls = Object.values(S.kvAll('hl')).filter(h => ids.has(h.pack)).sort((a, b) => a.c - b.c);
  const qs = D.allQuestions({ subject: [sel] });
  const wrong = qs.filter(x => prog[x.key]?.wrong);
  const star = qs.filter(x => prog[x.key]?.star && !prog[x.key]?.wrong);
  const guessed = qs.filter(x => S.attemptsOf(x.key).some(e => e.guessed) && !prog[x.key]?.wrong && !prog[x.key]?.star);
  const cards = D.allCards({ subject: [sel] }).filter(x => { const c = S.cp(x.key); return c && c.n && c.box === 0; });
  const ex = examInfo().subjects[sel] || {};
  const right = qq => qq.type === 'mcq' ? (Array.isArray(qq.answer) ? qq.answer : [qq.answer]).map(n => esc(qq.choices[n - 1])).join(', ') : qq.type === 'short' ? esc(qq.answers[0]) : esc(qq.model_answer);
  const qRow = x => `<li class="item" style="align-items:flex-start;display:block"><b>${esc(x.q.question)}</b><br><span class="small">→ ${right(x.q)}</span>${causeOf(x.key) ? ` <span class="tag">${CAUSES.find(c => c[0] === causeOf(x.key))?.[1]}</span>` : ''}${x.q.explanation ? `<br><span class="small muted">${esc(x.q.explanation)}</span>` : ''}</li>`;
  main.innerHTML = `<div class="row between"><h1 style="margin:0">${subjDot(sel)} ${subjName(sel)} 시험 전 정리</h1><button class="btn sm ghost noprint" id="fPrint">인쇄</button></div>
  <p class="small muted">${ex.date ? `${S.fmtDate(ex.date)} · ${dLabel(ex.date)}` : '시험일 미정'}${ex.range ? ' · 범위: ' + esc(ex.range) : ''}</p>
  <div class="row noprint" style="margin:10px 0">${wrong.length + star.length ? `<button class="btn pri" id="fRetry">오답·헷갈린 문제 ${wrong.length + star.length + guessed.length}개 다시 풀기</button>` : ''}${cards.length ? `<button class="btn" id="fCards">모르는 카드 ${cards.length}장</button>` : ''}</div>
  ${notes.length ? `<section class="card"><h2>내 단원 메모</h2>${notes.map(n => `<p><b>${esc(D.db().byId[n.pack]?.title || '')}</b><br><span style="white-space:pre-wrap">${esc(n.text)}</span></p>`).join('')}</section>` : ''}
  ${hls.length ? `<section class="card"><h2>형광펜·메모 ${hls.length}</h2><ul class="list">${hls.map(h => `<li class="item" style="display:block"><span class="hl-text hl-${h.color}">${esc(h.text)}</span>${h.note ? `<br><span class="small">✎ ${esc(h.note)}</span>` : ''}</li>`).join('')}</ul></section>` : ''}
  ${wrong.length ? `<section class="card"><h2>오답 ${wrong.length}</h2><ul class="list">${wrong.map(qRow).join('')}</ul></section>` : ''}
  ${star.length ? `<section class="card"><h2>헷갈림 표시 ${star.length}</h2><ul class="list">${star.map(qRow).join('')}</ul></section>` : ''}
  ${guessed.length ? `<section class="card"><h2>찍어서 맞혔던 문제 ${guessed.length}</h2><ul class="list">${guessed.map(qRow).join('')}</ul></section>` : ''}
  ${cards.length ? `<section class="card"><h2>아직 모르는 카드 ${cards.length}</h2><table class="crit">${cards.map(x => `<tr><td><b>${esc(x.c.front)}</b></td><td>${esc(x.c.back)}</td></tr>`).join('')}</table></section>` : ''}
  ${!notes.length && !hls.length && !wrong.length && !star.length && !cards.length ? '<p class="muted">아직 모을 것이 없다. 공부하면서 형광펜, 단원 메모, 헷갈림 표시를 남기면 여기에 쌓인다.</p>' : ''}`;
  $('#fPrint').addEventListener('click', () => window.print());
  $('#fRetry')?.addEventListener('click', () => startSession(shuffle([...wrong, ...star, ...guessed]), 'practice'));
  $('#fCards')?.addEventListener('click', () => { flash = { list: shuffle(cards), i: 0, back: false, knew: 0, flip: 'front' }; location.hash = '#/flash'; });
}

// ================= 자료 점검 =================
// 표시가 깨지거나 채점이 이상해질 수 있는 곳을 찾는다. level: err(고쳐야 함) / warn(확인) / info(참고)
function checkPack(p) {
  const out = [];
  const add = (level, where, msg) => out.push({ level, where, msg, pack: p });
  const scanText = (where, t) => {
    if (!t) return;
    if (/\$[^$\n]*[=^_{}\\][^$\n]*\$|\\frac|\\times|\\cdot|\\sqrt|\\\(|\\\[/.test(t)) add('err', where, 'LaTeX 수식이 있다. 사이트는 수식을 그리지 않아 기호가 그대로 보인다. "v = s/t", "H₂O" 처럼 글자로 써야 한다.');
    if (/\\n/.test(t)) add('err', where, '"\\n" 글자가 그대로 들어 있다. 줄바꿈이 안 되고 \\n 이 보인다.');
    if (/&(lt|gt|amp|quot|nbsp);/.test(t)) add('warn', where, 'HTML 기호(&lt; 등)가 글자로 들어 있다. 그대로 보일 수 있다.');
  };
  const scanMd = (where, t) => {
    if (!t) return;
    scanText(where, t);
    for (const para of t.split(/\n\s*\n/)) {
      const bold = (para.match(/\*\*/g) || []).length;
      if (bold % 2) add('err', where, `굵게(**)가 짝이 안 맞는다: "${para.trim().slice(0, 40)}…"`);
    }
    if ((t.match(/```/g) || []).length % 2) add('err', where, '코드 블록(```)이 닫히지 않았다. 뒤의 내용이 전부 코드처럼 보인다.');
    if (/^#{1,6}[^#\s]/m.test(t)) add('warn', where, '"##제목" 처럼 # 뒤에 띄어쓰기가 없다. 제목으로 안 보인다.');
    const lines = t.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*\|.*\|\s*$/.test(lines[i]) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {
        const cols = lines[i].split('|').length;
        for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j++) if (lines[j].split('|').length !== cols) { add('warn', where, `표의 칸 수가 줄마다 다르다: "${lines[j].trim().slice(0, 40)}"`); break; }
      }
    }
    const strike = t.match(/~~[^~\n]+~~/g);
    if (strike) add('info', where, `취소선이 ${strike.length}곳 있다 (~~글~~). 일부러 쓴 게 아니면 확인.`);
  };
  scanMd('본문', p.notes);
  (p.texts || []).forEach((t, i) => scanText(`원문 ${t.title || i + 1}`, t.body));
  if (['kor', 'eng', 'jpn'].includes(p.subject) && !(p.texts || []).length && !SRC.textsOf(p).length) add('info', '원문', '원문(본문)이 없다. "본문 같이 보기" 를 쓰려면 원문을 넣는다.');
  (p.questions || []).forEach((q, i) => {
    const w = `문제 ${i + 1}`;
    scanText(w, q.question); scanText(w + ' 지문', q.context); scanText(w + ' 해설', q.explanation);
    if (/윗글|다음 글|아래 글|<보기>|\[보기\]|다음 시|다음 자료/.test(q.question) && !q.context) add('err', w, `"${q.question.slice(0, 30)}…" — 지문이나 <보기> 를 가리키는데 context 가 비어 있다.`);
    if (q.type === 'mcq') {
      if (q.choices.some(c => /^\s*([①②③④⑤]|\(?[1-5][).]\s)/.test(c))) add('warn', w, '보기 앞에 ①② 나 1) 번호가 붙어 있다. 사이트가 번호를 또 붙여서 두 번 보인다.');
      if (new Set(q.choices.map(c => c.trim())).size !== q.choices.length) add('err', w, '똑같은 보기가 두 개 있다.');
      const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
      if (ans.length > 1 && !/모두|두 개|2개|고른 것|있는 대로/.test(q.question)) add('warn', w, '답이 여러 개인데 발문에 "모두 고르면" 같은 말이 없다.');
    }
    if (q.type === 'short') {
      if (q.answers.some(a => /[,/]|또는/.test(a) && a.length > 3)) add('warn', w, `정답 "${q.answers.find(a => /[,/]|또는/.test(a))}" 에 쉼표나 / 가 있다. 다른 표기는 answers 에 따로 나눠야 채점이 된다.`);
    }
    if (q.type === 'essay') {
      const sum = D.essayMax(q);
      if (!sum) add('err', w, '서술형 배점 합이 0점이다.');
      if (q.model_answer && q.model_answer.length < 10) add('warn', w, '모범 답안이 너무 짧다.');
    }
    if (!q.explanation) add('info', w, '해설이 없다.');
  });
  (p.cards || []).forEach((c, i) => {
    if (c.front.trim() === c.back.trim()) add('warn', `카드 ${i + 1}`, '앞면과 뒷면이 같다.');
    scanText(`카드 ${i + 1}`, c.front + ' ' + c.back);
  });
  const qids = (p.questions || []).map(q => q.question.trim());
  const dup = qids.filter((t, i) => qids.indexOf(t) !== i);
  if (dup.length) add('warn', '문제', `발문이 똑같은 문제가 ${dup.length}개 있다.`);
  return out;
}
function checkAll() { return D.db().packs.flatMap(checkPack); }

function viewCheck() {
  const { q } = params();
  const showInfo = q.get('all') === '1';
  const all = checkAll().filter(x => showInfo || x.level !== 'info');
  const byPack = {};
  for (const x of all) (byPack[x.pack.id] = byPack[x.pack.id] || []).push(x);
  const nErr = all.filter(x => x.level === 'err').length, nWarn = all.filter(x => x.level === 'warn').length;
  const tag = { err: '<span class="tag bad">고쳐야 함</span>', warn: '<span class="tag warn">확인</span>', info: '<span class="tag">참고</span>' };
  main.innerHTML = `<h1>자료 점검</h1>
  <p class="small muted">공부자료 ${D.db().packs.length}개를 검사했다. 표시가 깨지는 곳(수식, 굵게 짝, \\n, 표), 채점이 이상해질 곳(지문 없는 문제, 보기 번호 중복, 정답 표기)을 찾는다. 물결표(~)는 이제 취소선으로 바뀌지 않아서 따로 고칠 필요가 없다.</p>
  <section class="grid" style="margin-bottom:12px"><div class="stat"><b style="color:var(--bad)">${nErr}</b><span>고쳐야 함</span></div><div class="stat"><b style="color:var(--warn)">${nWarn}</b><span>확인</span></div></section>
  <p><a class="small" href="#/check${showInfo ? '' : '?all=1'}">${showInfo ? '참고 항목 숨기기' : '참고 항목(해설 없음, 원문 없음)도 보기'}</a></p>
  ${Object.values(byPack).map(list => {
    const p = list[0].pack;
    const fix = `네가 준 "${p.title}" (id: ${p.id}) 자료에서 아래 문제가 나왔어. 고친 JSON 을 다시 줘. id 는 바꾸지 마.\n\n${list.filter(x => x.level !== 'info').map(x => `- ${x.where}: ${x.msg}`).join('\n')}`;
    return `<section class="card"><div class="row between"><h2 style="margin:0">${subjDot(p.subject)} <a href="#/pack?id=${encodeURIComponent(p.id)}">${esc(p.title)}</a></h2>${list.some(x => x.level !== 'info') ? `<button class="btn sm" data-fix="${esc(p.id)}">고칠 프롬프트 복사</button>` : ''}</div>
      <ul class="list">${list.map(x => `<li class="item" style="align-items:flex-start">${tag[x.level]}<span class="grow small"><b>${esc(x.where)}</b> ${esc(x.msg)}</span></li>`).join('')}</ul><pre class="prompt" hidden data-fixtext="${esc(p.id)}">${esc(fix)}</pre></section>`;
  }).join('') || '<p class="note info">고칠 곳이 없다.</p>'}`;
  $$('[data-fix]').forEach(b => b.addEventListener('click', () => { const pre = main.querySelector(`[data-fixtext="${CSS.escape(b.dataset.fix)}"]`); copyText(pre.textContent, pre); }));
}

// ================= 더보기, 도움말 =================
function viewMore() {
  const links = [
    ['#/journal', '공부 일지', '날짜별로 쌓인 공부 흔적과 한 줄 회고'],
    ['#/blank', '백지 복습', '자료를 안 보고 기억나는 것을 다 써 본 뒤 비교 (서울대생 백지 공부법·파인만 기법)'],
    ['#/final', '시험 전 정리', '과목별 단원 메모·형광펜·오답·헷갈린 문제를 한 장으로'],
    ['#/check', '자료 점검', '공부자료에 표시 오류나 형식 문제가 있는지 찾기'],
    ['#/marks', '형광펜·메모 모아보기', '자료에 칠한 곳과 메모만 훑어보기'],
    ['#/cards', '암기카드', '용어, 단어, 연도를 카드로 외운다'],
    ['#/gen', 'AI 문제 만들기', '자료를 보고 새 문제를 만든다'],
    ['#/plan', '시험 일정과 계획', '과목별 날짜·범위, 할 일 목록'],
    ['#/stats', '공부 기록과 그래프', '잔디 달력, 누적 그래프, 정답률 변화, 쌓은 기록, 집중 타이머'],
    ['#/prompts', '공부자료 Claude 프롬프트', '과목별 프롬프트 복사'],
    ['#/settings', '설정', '기록 동기화, API 키, 자료 가져오기, 백업'],
    ['#/help', '사용법', '자료를 넣는 방법과 기능 설명'],
  ];
  main.innerHTML = `<h1>더보기</h1><section class="card flat"><ul class="list">${links.map(([h, t, d]) => `<li><a class="item" href="${h}"><span class="grow"><b>${t}</b><br><span class="small muted">${d}</span></span>›</a></li>`).join('')}</ul></section>`;
}

function viewHelp() {
  main.innerHTML = `<h1>사용법</h1>
  <article class="card notes">${md(`
## 자료 넣는 방법 두 가지

1. **채팅 Claude 에게 받기**: [프롬프트](#/prompts) 화면에서 과목을 골라 복사해 그 과목 Claude 에게 보낸다. Claude 가 준 JSON 을 [설정 → 자료 가져오기](#/settings) 에 붙여넣고 "검사" → "가져오기". 동기화를 켜 두면 다른 기기에도 들어간다.
2. **Claude Code 가 저장소에 올리기**: PROMPT.md 의 "Claude Code 용 프롬프트" 를 쓴다. \`data/packs/\` 에 파일이 올라가면 모든 기기에서 보인다.

## 채점

- **객관식**: 바로 채점한다.
- **단답형**: 정답 목록과 띄어쓰기·문장부호를 빼고 비교한다. 다르면 API 키가 있을 때 AI 가 뜻이 같은지 본다. 키가 없으면 "Claude 채팅으로 확인 (무료)" 로 물어보거나 "내 답도 맞다" 로 고친다.
- **서술형**: API 키가 있으면 AI 가 바로 채점한다. 키가 없으면 **무료로** "채점 요청 복사" → claude.ai(무료 계정 가능)나 공부 Claude 채팅에 붙여넣기 → Claude 가 준 코드 블록을 사이트에 붙여넣기. 기준별 점수, 빠진 점, 고친 답안이 똑같이 들어가고 기록에 남는다. 스스로 채점도 된다.

## 공부법에서 가져온 기능

- **백지 복습** (서울대생 백지 공부법, 파인만 기법): 자료 화면의 "백지 복습" 또는 더보기 → 백지 복습. 자료를 덮고 기억나는 것을 다 쓴 뒤 "자료와 비교" 를 누르면 핵심어(굵은 글씨, 형광 강조, 소제목, 카드)를 몇 % 떠올렸는지, 빠진 핵심어가 무엇인지 보여 준다. Claude 에게 잘못 쓴 설명까지 확인받을 수 있다.
- **확신도 체크** (메타인지): 객관식·단답형에서 채점 전에 "확실 / 애매 / 찍음" 을 고른다. 찍어서 맞힌 문제는 아는 것으로 치지 않고 오답노트와 복습에 다시 나온다. 애매하게 맞힌 문제는 헷갈림 표시가 붙는다. 확실하다고 했는데 틀리면 따로 알려 준다.
- **오답 원인**: 오답노트에서 개념 부족 / 암기 부족 / 실수 / 문제 잘못 읽음 / 시간 부족을 고른다. 원인별로 모아 보고, 기록 화면에서 비율을 본다.
- **섞어 풀기** (인터리빙): 홈의 "섞어 풀기 20" 은 복습할 문제·오답·안 푼 문제를 과목을 번갈아 섞어 낸다. 한 과목만 몰아 풀 때보다 시험에서 더 잘 떠오른다.
- **시험 전 정리**: 더보기 → 시험 전 정리. 과목마다 내 단원 메모, 형광펜·메모, 오답, 헷갈린 문제, 찍어서 맞힌 문제, 모르는 카드를 한 장에 모은다. 시험 3일 전부터는 홈에 바로가기가 뜬다.
- **자료 점검**: 더보기 → 자료 점검. 수식(LaTeX), 짝 안 맞는 굵게, \n 글자, 표 칸 수, 지문 없는 문제, 보기 번호 중복, 정답 표기 문제를 찾고 고칠 프롬프트를 복사해 준다.

## 복습 순서

맞힌 문제는 1·2·4·7·14일 뒤에 다시 나온다. 틀리면 다음 날 다시 나온다. 홈의 "오늘 복습할 문제" 가 그날 풀 문제다.
오답노트는 틀리거나 부분 점수를 받은 문제를 모은다. 두 번 연속 맞히거나 "이제 안다" 를 누르면 빠진다.

## 실전 모드

문제 풀기에서 방식을 "실전" 으로 고르면 제한 시간 안에 다 풀고 한꺼번에 채점한다. 시험 전 주에 과목별로 한 번씩 해 본다.

## 공부 흔적

- **공부 일지**: 자료를 읽은 시간, 푼 문제 묶음과 결과, 카드, 실전, 질문, 형광펜, 끝낸 계획이 시각과 함께 날짜별로 쌓인다. 날마다 한 줄 회고를 남길 수 있다.
- **풀이 이력**: 한 문제를 여러 번 풀면 매번 쓴 답, 결과, AI 채점이 모두 남는다. 채점 결과 아래 "풀이 이력" 이나 오답노트에서 본다.
- **형광펜·메모**: 자료 본문 글자를 길게 눌러 고르면 아래에 색 버튼이 뜬다. 칠한 곳을 누르면 메모를 달거나 지운다. [모아보기](#/marks) 에서 과목·색별로 훑는다. 단원마다 따로 쓰는 "단원 메모" 도 있다.
- **읽은 시간과 이어 읽기**: 자료를 펼쳐 두고 실제로 보고 있던 시간만 센다 (90초 넘게 손대지 않으면 멈춤). 홈의 "이어 읽기" 로 지난번 읽던 곳부터 연다.
- **그래프**: [기록](#/stats) 에 공부한 날 달력, 누적 문제 수, 누적 공부 시간, 정답률 변화, 과목별 공부 시간, 달성한 기록이 나온다.

## 인터넷이 없을 때 (오프라인 모드)

인터넷이 될 때 사이트를 한 번 열어 두면 사이트 파일이 이 기기에 저장된다. 그 뒤로는 인터넷이 없어도 열린다 (홈 화면 아이콘도). 자료 읽기, 형광펜·메모, 문제 풀기와 채점(객관식·단답형·스스로 채점), 오답노트, 카드, 일지, 기록이 모두 된다. AI 채점, Claude 채팅 채점, 동기화, 새 자료 받기는 인터넷이 있어야 한다. 끊긴 동안 쌓인 기록은 연결되면 자동으로 올라간다. 위쪽에 "오프라인" 표시가 뜨면 지금 인터넷이 없는 상태다.

## 기록 동기화

[설정 → 기록 동기화](#/settings) 에 GitHub 토큰(Gists 읽기·쓰기 권한만)을 넣으면 기록이 내 비공개 Gist 에 쌓이고, 같은 토큰을 넣은 다른 기기와 합쳐진다. 동기화를 안 쓰면 기록은 그 기기의 브라우저에만 있다. 어느 쪽이든 가끔 [백업 파일](#/settings) 을 받아 둔다.
`)}</article>`;
}

// ---------- 새 버전 확인 ----------
// 사이트가 바뀌었는데 브라우저가 예전 파일을 쓰고 있으면 새 주소(?v=새 버전)로 다시 연다.
async function checkUpdate(manual) {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const { v } = await r.json();
    if (!v || v === window.SH_VERSION) { if (manual) toast('지금이 최신 버전이다.'); return; }
    const busy = document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName) && document.activeElement.value;
    if (busy && !manual) { toast('새 버전이 있다. 쓰던 글을 마치면 설정 → 새 버전 확인을 누른다.', 5000); return; }
    let tried = '';
    try { tried = sessionStorage.getItem('sh.updTried') || ''; } catch (e) {}
    if (tried === v && !manual) return;
    try { sessionStorage.setItem('sh.updTried', v); } catch (e) {}
    reader.flush && reader.flush();
    location.replace(location.pathname + '?v=' + v + location.hash);
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(false); });

// ---------- 시작 ----------
applyTheme();
window.addEventListener('sh-save-failed', () => toast('저장 공간이 부족하다. 설정에서 백업을 받고 동기화를 켜 줘.', 6000));
const syncDot = document.getElementById('syncDot');
SYNC.onStatus(st => {
  if (!syncDot) return;
  syncDot.hidden = !SYNC.isOn() && st.state === 'off';
  syncDot.className = 'syncdot ' + st.state;
  syncDot.title = st.state === 'error' ? '동기화 실패: ' + st.msg : st.state === 'busy' ? '동기화 중' : st.state === 'dirty' ? '올릴 기록 있음' : st.at ? '동기화됨 ' + S.fmtTime(st.at) : '동기화 꺼짐';
  syncDot.textContent = st.state === 'error' ? '동기화 실패' : st.state === 'busy' ? '동기화 중' : st.state === 'dirty' ? '저장 대기' : '동기화됨';
  const el = document.getElementById('syncState');
  if (el) el.innerHTML = syncText(st);
});
// 다른 기기 기록을 받아 합쳤으면 화면을 다시 그린다 (글을 쓰는 중이면 미룬다)
window.addEventListener('sh-synced', async () => {
  await D.loadAll();
  const busy = document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName);
  if (!busy && !['/run', '/flash'].includes(params().path)) { render.keepScroll = true; render(); }
});
// 오프라인 모드
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker?.register('sw.js').catch(e => console.warn('오프라인 모드 등록 실패', e));
}
const netDot = document.createElement('span');
netDot.className = 'netdot'; netDot.textContent = '오프라인'; netDot.hidden = navigator.onLine;
document.getElementById('topDday').after(netDot);
window.addEventListener('online', () => { netDot.hidden = true; toast('인터넷이 다시 연결됐다.'); if (SYNC.isOn()) SYNC.syncNow(); });
window.addEventListener('offline', () => { netDot.hidden = false; toast('인터넷이 끊겼다. 공부는 그대로 할 수 있고, 기록은 연결되면 올라간다.', 4500); });

D.loadAll().then(() => {
  render();
  startTimerLoop();
  SYNC.startAuto();
  checkUpdate(false);
});
