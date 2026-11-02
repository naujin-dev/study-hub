import * as S from './store.js';
import * as D from './data.js';
import * as AI from './ai.js';
import * as SYNC from './sync.js';
import * as HL from './hl.js';
import * as CH from './charts.js';
import * as PR from './prompts.js';
import * as SRC from './src.js';
import * as PDF from './pdf.js';
import * as NT from './notion.js';

const { SUBJECTS, SUBJ, TYPE_NAME } = D;
const main = document.getElementById('main');
const REPO_URL = 'https://github.com/naujin-dev/study-hub';

// ---------- 작은 도구 ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 지문은 글자 그대로 보여 주되 <u>밑줄</u> 만 살린다 (영어 어법·어휘 문제)
const ctxHtml = s => esc(s).replace(/&lt;u&gt;([\s\S]*?)&lt;\/u&gt;/g, "<u>$1</u>");
// 원문 한 줄: 밑줄(<u>)은 살리고, 줄을 넘어가 짝이 안 맞는 밑줄 표시는 지운다
const srcLine = l => ctxHtml(l).replace(/&lt;\/?u&gt;/g, '');
const $ = (sel, root = main) => root.querySelector(sel);
const $$ = (sel, root = main) => [...root.querySelectorAll(sel)];
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// 자료 없이 공부 시간만 재는 과목
const TIME_SUBJ = { math: { id: 'math', name: '수학' } };
// 과목 색은 css 의 --s-과목 토큰 (다크 모드에서 밝은 색으로 바뀐다)
const subjColor = id => (SUBJ[id] || TIME_SUBJ[id]) ? `var(--s-${id})` : 'var(--acc)';
const subjDot = id => `<span class="dot" style="--c:${subjColor(id)}"></span>`;
const subjName = id => (SUBJ[id] || TIME_SUBJ[id])?.name || id;

// action = { label, fn }: 알림 안에 되돌리기 같은 버튼을 하나 단다
function toast(msg, ms = 2200, action = null) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('act', !!action);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-act'; b.textContent = action.label;
    b.onclick = () => { t.classList.remove('show'); action.fn(); };
    t.append(' ', b);
  }
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
const stripDate = t => t.replace(/^(\S+\s)?\d{1,2}\/\d{1,2}(\([월화수목금토일]\))?(~\d{1,2})?\s*/, (m, pre) => pre && !/\d/.test(pre) ? pre : '').replace(/:\s*·\s*/, ': ');
function notionItems() {
  const p = D.db().plan;
  if (!p || !Array.isArray(p.weeks)) return [];
  const out = [];
  for (const w of p.weeks) for (const g of w.groups || []) for (const it of g.items || []) {
    out.push({ id: it.id, date: it.date || null, subject: g.subject || '', label: g.label || '', text: it.self && !it.date ? it.text : stripDate(it.text), raw: it.text, group: it.self ? '' : g.title, week: w.id, done: !!it.done, notion: true });
  }
  return out;
}
function planList() {
  const kv = S.kvAll('plan');
  const nis = notionItems();
  const ids = new Set(nis.map(n => n.id));
  const merged = nis.map(n => (kv[n.id] ? { ...n, ...kv[n.id], notion: true, text: n.text, group: n.group, date: n.date, done: !!(kv[n.id].done || n.done) } : n));
  const mine = Object.values(kv).filter(x => !ids.has(x.id) && !x.notion).map(p => ({ ...p }));
  return [...merged, ...mine].sort((a, b) => ((a.date || '9') + a.id).localeCompare((b.date || '9') + b.id));
}
function setPlan(id, patch) {
  const cur = S.kvGet('plan', id) || notionItems().find(n => n.id === id);
  if (!cur) return;
  const { u, ...rest } = cur;
  S.kvSet('plan', id, rest.notion ? { id, notion: true, done: rest.done, ...patch } : { ...rest, ...patch });
}
const planText = t => String(t || '').replace(/\s*\(study-hub [a-z]{3}-\d+[a-z0-9-]*\)/g, '');
const planLine = p => `${p.subject ? subjDot(p.subject) + ' ' : p.label ? `<span class="tag">${esc(p.label)}</span> ` : ''}${esc(planText(p.text))}${p.group ? `<br><span class="small muted">${esc(p.group.length > 60 ? p.group.slice(0, 60) + '…' : p.group)}</span>` : ''}`;

// 계획 한 줄이 가리키는 자료를 찾는다. 「작품」 이름이나 자료 제목이 줄에 들어 있으면 그 자료.
const coreTitle = t => String(t || '').replace(/^[\s\d.\-–·()]+/, '').replace(/[「」『』"'()\[\]]/g, '').replace(/\s+/g, '').trim();
function planPack(p) {
  if (!p) return null;
  const text = String(p.raw || p.text || '');
  const flat = text.replace(/\s+/g, '');
  const pool = D.db().packs.filter(k => !p.subject || k.subject === p.subject);
  // 1) 줄에 자료 id 가 적혀 있으면 (예: "study-hub eng-02") 그 자료
  for (const m of text.matchAll(/\b([a-z]{3}-\d{2,})\b/g)) { const hit = D.db().packs.find(k => k.id === m[1] || k.id.startsWith(m[1] + '-') || (k._mergedFrom || []).some(x => x.id.startsWith(m[1]))); if (hit) return hit; }
  // 2) "리딩파워 14단원" 처럼 교재 이름 + 번호
  for (const m of text.matchAll(/([가-힣A-Za-z]{2,})\s*(\d{1,3})\s*(?:단원|강|과|課|unit|Unit)?/g)) {
    const re = new RegExp(m[1] + '\\s*(?:CHAPTER\\s*|unit\\s*)?0*' + m[2] + '(?!\\d)', 'i');
    const hit = pool.find(k => re.test(k.title));
    if (hit) return hit;
  }
  const quoted = [...text.matchAll(/[「『]([^」』]{2,})[」』]/g)].map(m => m[1].replace(/\s+/g, ''));
  for (const qn of quoted) { const hit = pool.find(k => coreTitle(k.title).includes(qn) || qn.includes(coreTitle(k.title))); if (hit) return hit; }
  return pool.filter(k => coreTitle(k.title).length >= 3).sort((a, b) => coreTitle(b.title).length - coreTitle(a.title).length).find(k => flat.includes(coreTitle(k.title))) || null;
}
const planGo = p => {
  const k = planPack(p);
  if (!k && /^(수학|대수|기하|미적|확통|수[ⅠⅡ12])/.test(String(p.text || '').trim())) return `<a class="plan-go" href="#/math" aria-label="시간 재기: 수학">시간 재기<span aria-hidden="true"> →</span></a>`;
  return k ? `<a class="plan-go" href="#/pack?id=${encodeURIComponent(k.id)}" aria-label="자료 열기: ${esc(k.title)}">자료<span aria-hidden="true"> →</span></a>` : ''; };

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
  themeBtn.textContent = '화면: ' + ({ auto: '자동', light: '밝게', dark: '어둡게' }[t] || '자동');
}
themeBtn.addEventListener('click', () => {
  const order = ['auto', 'dark', 'light']; // 밤에 많이 쓰므로 자동 다음은 어둡게
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
  '/math': viewMath,
  '/pdf': viewPdf,
};
// 아래 메뉴에서 켜질 칸. 암기카드·계획·시간 재기는 더보기에 들어 있으므로 더보기가 켜진다.
const navOf = { '/': 'home', '/study': 'study', '/pack': 'study', '/pdf': 'study', '/quiz': 'quiz', '/run': 'quiz', '/wrong': 'wrong' };

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
  // 화면 제목을 탭 제목에 쓰고, 다른 화면으로 옮겨 왔으면 키보드 초점을 그 화면 제목으로
  const h1 = main.querySelector('h1');
  document.title = h1 && h1.textContent.trim() ? `${h1.textContent.trim()} · 2회고사 공부방` : '2회고사 공부방';
  if (!render.keepScroll) {
    window.scrollTo(0, 0);
    const a = document.activeElement;
    if (h1 && (!a || a === document.body || a.closest('nav.bottom'))) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
  }
  render.keepScroll = false;
}
window.addEventListener('hashchange', render);
// 되돌리기 같은 버튼이 달린 알림은 다른 화면으로 가면 닫는다
window.addEventListener('hashchange', () => { const t = document.getElementById('toast'); if (t.classList.contains('act')) t.classList.remove('show'); });

function updateTop() {
  const ex = examInfo();
  document.getElementById('topDday').textContent = ex.first ? `${ex.title || '2회고사'} ${dLabel(ex.first)}` : '';
  // 일주일 안으로 들어오면 빨강, 그 전에는 차분한 색
  document.getElementById('topDday').classList.toggle('near', !!ex.first && S.daysBetween(S.today(), ex.first) <= 7);
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
const studied = l => !!(l && (l.q || l.c || l.min || l.read >= 60 || l.free >= 60));
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

  const weak = unitStats().filter(u => u.n >= 3 && u.rate < 0.8).sort((a, b) => a.rate - b.rate).slice(0, 3);

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

  // 오늘 계획이 없으면 가장 가까운 다음 날 계획을 보여 준다
  const upcoming = (() => {
    if (plan.length) return null;
    const next = planList().filter(p => p.date && p.date > t && !p.done && !p.hidden).sort((a, b) => a.date.localeCompare(b.date));
    if (!next.length) return null;
    const d = next[0].date;
    return { d, items: next.filter(p => p.date === d) };
  })();
  const goal = S.kvGet('goal', 'day')?.min || 0;
  const daySec = S.studySec(log), ySec = S.studySec(S.getLog()[S.addDays(t, -1)]);
  const mc = S.load('mclock', null);
  const runSec = mc ? (Date.now() - mc.start) / 1000 : 0;
  const goalPer = goal ? Math.min(100, Math.round((daySec + runSec) / 60 / goal * 100)) : 0;
  const nst = NT.status();
  const sm = nst && nst.scope.length ? NT.scopeSummary(nst.scope) : null;
  const goalOf = Object.fromEntries(goals.map(g => [g.s.id, g]));
  const tdate = new Date(t + 'T00:00:00');
  const planRow = p => `<li class="plan-li"><label class="item plan-item"><input type="checkbox" data-plan="${p.id}"${p.done ? ' checked' : ''}><span class="grow${p.done ? ' done' : ''}">${planLine(p)}</span></label>${planGo(p)}</li>`;

  main.innerHTML = `
  ${D.db().loadErrors.length ? `<div class="note" style="margin-bottom:12px"><b>자료를 일부 못 읽었다.</b><br>${D.db().loadErrors.slice(0, 5).map(esc).join('<br>')}</div>` : ''}
  ${(() => {
    // 기록이 안 남는 일이 없게, 기기 저장 공간이 80% 넘게 차면 홈 맨 위에서 알린다
    const mb = S.storageBytes() / 1048576;
    return mb > 4 ? `<p class="note warnbar" role="status"><b>이 기기 저장 공간이 거의 찼다 (${mb.toFixed(2)}MB / 약 5MB).</b> 더 차면 새 기록이 저장되지 않는다. <a href="#/settings">설정</a>에서 백업을 받은 뒤 안 보는 가져온 자료를 지운다.</p>` : '';
  })()}
  <header class="home-head">
    <h1>${tdate.getMonth() + 1}월 ${tdate.getDate()}일 ${'일월화수목금토'[tdate.getDay()]}요일</h1>
    <p class="muted">${ex.first ? `첫 시험까지 <b class="ink mono">${Math.max(0, S.daysBetween(t, ex.first))}일</b> · ${ex.days.map(d => { const subs = SUBJECTS.filter(s => ex.subjects[s.id]?.date === d); return `${Number(d.slice(5, 7))}/${Number(d.slice(8))}(${'일월화수목금토'[new Date(d + 'T00:00:00').getDay()]})${subs.length ? ' ' + subs.map(s => s.name).join('·') : ''}`; }).join(' · ')}${ex.days.some(d => SUBJECTS.some(s => ex.subjects[s.id]?.date === d)) ? '' : ' · <a href="#/plan">과목별 날짜 넣기</a>'}` : '시험 날짜 미정'} · <a href="#/plan">일정</a></p>
  </header>

  ${!packs.length ? `<section class="card"><h2>아직 공부자료가 없다</h2>
    <p>과목별 공부자료 Claude 에게 <a href="#/prompts">프롬프트</a> 를 복사해서 보내고 자료를 받은 뒤,</p>
    <ul><li>채팅 Claude 가 준 JSON 은 <a href="#/settings">설정 → 자료 가져오기</a> 에 붙여넣거나</li><li>Claude Code 에게 저장소에 바로 올리게 하면 된다.</li></ul></section>` : ''}

  <div class="home-grid">
  <div class="home-main">
    ${lastRead ? `<a class="resume" href="#/pack?id=${encodeURIComponent(lastRead.pack)}&resume=1" style="--tint:var(--t-${D.db().byId[lastRead.pack].subject})">${subjDot(D.db().byId[lastRead.pack].subject)}<span class="grow"><span class="small muted">이어 읽기 · ${S.fmtDate(S.dayOf(lastRead.t))}${pos && pos.r >= 0.05 ? ` · ${Math.round(pos.r * 100)}%까지 읽음` : ''}</span><br><b>${esc(D.db().byId[lastRead.pack].title)}</b></span><span class="go" aria-hidden="true">→</span></a>` : ''}
    <section class="card today">
      <div class="row between" style="align-items:baseline"><h2 style="margin:0">${plan.length ? '오늘 할 일' : upcoming ? `다음 할 일 · ${S.fmtDate(upcoming.d)}` : '오늘 할 일'}</h2>
        <span class="small muted">${plan.length ? `${plan.filter(p => p.done).length}/${plan.length} 끝냄` : ''}${weekLeft ? `${plan.length ? ' · ' : ''}이번 주 날짜 없는 일 ${weekLeft}개` : ''}</span></div>
      ${plan.length ? `<ul class="list plan-list">${plan.map(planRow).join('')}</ul>`
        : upcoming ? `<p class="small muted" style="margin:4px 0 2px">오늘은 계획이 없다. 미리 보기:</p><ul class="list plan-list">${upcoming.items.slice(0, 6).map(planRow).join('')}</ul>${upcoming.items.length > 6 ? `<p class="small"><a href="#/plan">${upcoming.items.length - 6}개 더 보기</a></p>` : ''}`
        : '<p class="muted small">계획이 없다. <a href="#/plan">계획 화면</a> 에서 할 일을 더하거나 Notion 자동 업데이트를 켠다.</p>'}
      <div class="row today-actions">
        ${due.length ? `<a class="btn pri" href="#/run?src=due">복습 ${due.length}문제</a>` : ''}
        ${wrong.length ? `<a class="btn" href="#/run?src=wrong">오답 ${wrong.length}문제 다시</a>` : ''}
        <details class="menu"><summary class="btn">더 풀기</summary><div class="menu-pop" style="left:0;right:auto;transform-origin:top left">
          <a class="mi" href="#/quiz">문제 골라서 풀기</a>
          ${D.allQuestions().length ? '<button type="button" class="mi" id="mixBtn">섞어 풀기 <span class="muted">과목 번갈아 20문제</span></button>' : ''}
          <a class="mi" href="#/cards">암기카드${(() => { const t = S.today(); const n = D.allCards().filter(x => { const r = S.cp(x.key); return r && r.due && r.due <= t; }).length; return n ? ` <span class="muted">외울 때 된 ${n}장</span>` : ''; })()}</a>
        </div></details>
      </div>
    </section>

    ${(() => {
      const sec = daySec + runSec, streak = streakDays();
      const tools = `<span class="row"><a class="btn sm ghost" href="#/math">${mc ? `${subjName(mc.sub || 'math')} 재는 중` : '시간 재기'}</a><button class="btn sm ghost" id="goalBtn">${goal ? '목표 바꾸기' : '목표 정하기'}</button></span>`;
      // 아직 공부 기록이 없으면 0 을 크게 늘어놓지 않고 한 줄로만 보여 준다
      if (sec < 60 && !log.q && !log.c) return `<section class="card flat time quiet"><div class="row between" style="align-items:center"><p class="small muted" style="margin:0">오늘 공부 시간은 아직 없다${goal ? ` · 목표 ${S.fmtDur(goal * 60)}` : ''}${ySec ? ` · 어제 ${S.fmtDur(ySec)}` : ''}</p>${tools}</div></section>`;
      return `<section class="card time">
      <div class="row between" style="align-items:baseline">
        <p class="time-big">오늘 <b class="mono">${sec < 60 ? '0분' : S.fmtDur(sec)}</b>${goal ? `<span class="muted"> / ${S.fmtDur(goal * 60)}</span>` : ''}</p>
        ${tools}
      </div>
      ${goal ? `<div class="bar" style="--c:${goalPer >= 100 ? 'var(--ok)' : 'var(--acc)'}"><i style="width:${goalPer}%"></i></div>` : ''}
      <p class="small muted" style="margin:8px 0 0">${goal ? `${goalPer >= 100 ? '오늘 목표를 채웠다 · ' : `목표의 ${goalPer}% · `}` : ''}문제 ${log.q}개${log.q ? ` (정답 ${pct(log.ok, log.q)}%)` : ''} · 카드 ${log.c || 0}장 · 어제 ${S.fmtDur(ySec)}${streak ? ` · ${streak}일째 이어서 공부` : ''}</p>
    </section>`;
    })()}

    ${(() => {
      const near = SUBJECTS.filter(s => { const d = subjDate(s.id); return d && S.daysBetween(t, d) >= 0 && S.daysBetween(t, d) <= 3; });
      return near.length ? `<section class="card flat" style="border-color:var(--bad)"><b>시험이 코앞이다</b><div class="row" style="margin-top:8px">${near.map(s => `<a class="btn sm" href="#/final?s=${s.id}">${subjDot(s.id)} ${s.name} 시험 전 정리 (${dLabel(subjDate(s.id))})</a>`).join('')}</div></section>` : '';
    })()}
    ${(() => { const n = checkAll().filter(x => x.level === 'err').length; return n ? `<p class="small muted" style="margin:0 0 12px">공부자료에 고칠 곳 ${n}개 · <a href="#/check">자료 점검</a></p>` : ''; })()}
  </div>

  <aside class="home-side">
    ${sm ? `<a class="card flat scope-mini" href="#/plan"><div class="row between"><b>시험 범위 회독</b><span class="small muted mono">${sm.done}/${sm.cells}칸</span></div><div class="bar" style="margin:8px 0 6px"><i style="width:${sm.pct}%"></i></div><span class="small muted">범위 ${sm.rows}줄 × 회독 ${Math.round(sm.cells / Math.max(1, sm.rows))}번 · Notion 체크 기준 (${esc(String(nst.generated || '').slice(5, 16).replace('T', ' '))})</span></a>` : ''}

    <section class="card flat subj-table">
      <div class="row between"><h2 style="margin:0">과목</h2><span class="small muted">푼 문제 · 정답률 · 하루 목표</span></div>
      <ul class="list">${SUBJECTS.filter(s => st[s.id].packs).map(s => {
        const o = st[s.id], g = goalOf[s.id], date = subjDate(s.id);
        return `<li><a class="item srow" href="#/study?s=${s.id}">${subjDot(s.id)}<span class="grow"><b>${s.name}</b>${date ? ` <span class="small muted">${dLabel(date)}</span>` : ''}<span class="mini-bar wide" style="--c:${subjColor(s.id)}"><i style="width:${pct(o.tried, o.total)}%;background:${subjColor(s.id)}"></i></span></span>
          <span class="nums mono small"><span>${o.tried}/${o.total}</span><span>${o.n ? pct(o.ok, o.n) + '%' : '–'}</span><span>${g ? g.per + '문제' : '–'}</span></span></a></li>`;
      }).join('')}
        <li><a class="item srow" href="#/math">${subjDot('math')}<span class="grow"><b>수학</b> <span class="small muted">시간만</span></span><span class="small muted mono">오늘 ${S.fmtDur(S.getLog()[t]?.fs?.math || 0)} · 누적 ${S.fmtDur(mathTotal())}</span></a></li>
        ${SUBJECTS.filter(s => !st[s.id].packs).length ? `<li class="item small muted">자료 없음: ${SUBJECTS.filter(s => !st[s.id].packs).map(s => s.name).join(', ')}</li>` : ''}
      </ul>
    </section>

    ${weak.length ? `<section class="card flat"><div class="row between"><h2 style="margin:0">약한 단원</h2><span class="small muted">정답률 낮은 순</span></div><ul class="list">${weak.map(u => `<li><a class="item" href="#/pack?id=${encodeURIComponent(u.pack.id)}">${subjDot(u.pack.subject)}<span class="grow">${esc(u.pack.title)}</span><span class="small mono"${u.rate < 0.7 ? ' style="color:var(--bad)"' : ''}>${Math.round(u.rate * 100)}%</span></a></li>`).join('')}</ul></section>` : ''}
  </aside>
  </div>
  `;
  $('#goalBtn')?.addEventListener('click', () => {
    const cur = S.kvGet('goal', 'day')?.min || 0;
    const v = prompt('하루 공부 시간 목표를 시간으로 쓴다. 예: 3, 4.5 (비우면 목표 없음)', cur ? String(Math.round(cur / 6) / 10) : '');
    if (v === null) return;
    const h = parseFloat(v.replace(',', '.'));
    if (v.trim() && !(h > 0 && h <= 20)) return toast('0~20 사이 숫자로 쓴다.');
    if (v.trim()) S.kvSet('goal', 'day', { min: Math.round(h * 60) }); else S.kvDel('goal', 'day');
    render.keepScroll = true; render();
  });
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
// ---------- 자료 묶기 ----------
// 자료의 종류: 정리 노트인지, 문제 위주인지, 카드·원문 위주인지
function packKind(p) {
  const nl = String(p.notes || '').length, qn = (p.questions || []).length + (p.book || []).length;
  if ((p.book || []).length && nl < 800) return '책 문제';
  if (qn >= 30 || (qn >= 15 && nl < 3000)) return '문제·실전';
  if (nl >= 800) return '정리 노트';
  if ((p.cards || []).length) return '암기';
  return '기타';
}
const KIND_ORDER = ['정리 노트', '문제·실전', '책 문제', '암기', '기타'];
// 단원: 내가 정한 것(kv punit) > 자료의 unit > 없음
// 자료마다 단원 글이 조금씩 달라서("한국사2 Ⅱ. 대한민국의 발전", "한국사2 Ⅱ단원") 단원 번호만 뽑아 묶는다
function unitKey(u) {
  u = String(u || '').trim();
  if (!u) return '';
  let m = u.match(/chapter\s*0?(\d+)/i); if (m) return `CHAPTER ${m[1].padStart(2, '0')}`;
  m = u.match(/([\d·~]+)\s*과/); if (m) return `${m[1]}과`;
  m = u.match(/([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)\s*(?:\.|단원)/); if (m) return `${m[1]}단원`;
  m = u.match(/(\d+)\s*단원/); if (m) return `${m[1]}단원`;
  return u.replace(/^(고등|공통)\s*\S+\s+/, '').trim() || u;
}
const unitOf = p => S.kvGet('punit', p.id)?.unit || unitKey(p.unit);
// 화면에 보일 짧은 단원 이름: "2026 10월 고1 학평 · 현대시" → "10월 학평 · 현대시", "공통국어2 2회고사" → "2회고사"
const shortUnit = u => String(u || '').replace(/^20\d\d\s*/, '').replace(/고1\s*/, '').replace(/^(공통국어\d|통합사회\d|한국사\d)\s+/, '').replace(/\s+/g, ' ').trim();
// 내 분류 (과목마다): kv pcat[과목] = { cats: [{ id, name }] }, kv pcatof[자료 id] = { cat }
const myCats = sub => S.kvGet('pcat', sub)?.cats || [];
const saveCats = (sub, cats) => S.kvSet('pcat', sub, { cats });
const catOf = p => { const c = S.kvGet('pcatof', p.id)?.cat; return c && myCats(p.subject).some(x => x.id === c) ? c : ''; };
function setCatOf(id, cat) { if (cat) S.kvSet('pcatof', id, { cat }); else S.kvDel('pcatof', id); }
function addCat(sub, name) {
  name = String(name || '').trim();
  if (!name) return null;
  const cats = myCats(sub);
  const hit = cats.find(c => c.name === name);
  if (hit) return hit.id;
  const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
  saveCats(sub, [...cats, { id, name }]);
  return id;
}
function packGroups(list, mode) {
  if (mode === 'mine') {
    const sub = list[0]?.subject;
    const cats = myCats(sub);
    const out = cats.map(c => ({ name: c.name, cat: c.id, packs: list.filter(p => catOf(p) === c.id) }));
    const rest = list.filter(p => !catOf(p));
    if (rest.length) out.push({ name: '분류 안 됨', cat: '', packs: rest });
    return out;
  }
  const by = new Map();
  for (const p of list) {
    const k = mode === 'kind' ? packKind(p) : (unitOf(p) || '단원 없음');
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(p);
  }
  const keys = [...by.keys()];
  if (mode === 'kind') keys.sort((x, y) => KIND_ORDER.indexOf(x) - KIND_ORDER.indexOf(y));
  return keys.map(k => ({ name: k, packs: by.get(k) }));
}
function packStats(p, prog, read) {
  const qs = [...(p.questions || []), ...(p.book || [])];
  const tried = qs.filter(x => prog[D.qkey(p, x)]?.n).length;
  const wrong = qs.filter(x => prog[D.qkey(p, x)]?.wrong).length;
  return { qn: qs.length, tried, wrong, cards: (p.cards || []).length, notes: String(p.notes || '').trim().length > 0, read: !!read[p.id], texts: (p.texts || []).length };
}

function viewStudy() {
  const { q } = params();
  const term = (q.get('q') || '').trim();
  const read = readMarks();
  const prog = S.getProgress();
  const all = D.db().packs;
  const counts = Object.fromEntries(SUBJECTS.map(s => [s.id, all.filter(p => p.subject === s.id).length]));
  let sel = q.get('s') || S.load('studySub', '');
  if (!SUBJ[sel] || !counts[sel]) sel = (SUBJECTS.find(s => counts[s.id]) || SUBJECTS[0]).id;
  S.save('studySub', sel);
  const packs = all.filter(p => p.subject === sel);
  const units = new Set(packs.map(unitOf).filter(Boolean));
  const mode = q.get('g') || S.load('studyGroup:' + sel, myCats(sel).length ? 'mine' : units.size >= 2 ? 'unit' : 'kind');
  const catEdit = mode === 'mine' && q.get('edit') === '1';
  S.save('studyGroup:' + sel, mode);
  const editing = q.get('order') === sel;
  const link = o => { const ps = new URLSearchParams({ s: sel, ...o }); return '#/study?' + ps; };

  let results = '';
  if (term) {
    const low = term.toLowerCase();
    const hits = [];
    for (const p of all) {
      const where = [];
      if ((p.title + ' ' + (p.unit || '')).toLowerCase().includes(low)) where.push('제목');
      const ni = (p.notes || '').toLowerCase().indexOf(low);
      if (ni >= 0) where.push('…' + p.notes.slice(Math.max(0, ni - 30), ni + 50).replace(/\s+/g, ' ') + '…');
      const qc = [...(p.questions || []), ...(p.book || [])].filter(x => (x.question + ' ' + (x.context || '')).toLowerCase().includes(low)).length;
      if (qc) where.push(`문제 ${qc}개`);
      const cc = (p.cards || []).filter(c => (c.front + ' ' + c.back).toLowerCase().includes(low)).length;
      if (cc) where.push(`카드 ${cc}개`);
      if (where.length) hits.push({ p, where });
    }
    results = `<section class="card flat"><div class="row between"><h2 style="margin:0">"${esc(term)}" 찾은 결과 ${hits.length}개</h2><a class="small" href="${link({})}">닫기</a></div><ul class="list">${hits.map(h => `<li><a class="item" href="#/pack?id=${encodeURIComponent(h.p.id)}&hl=${encodeURIComponent(term)}">${subjDot(h.p.subject)}<span class="grow"><b>${esc(h.p.title)}</b><br><span class="small muted">${h.where.map(esc).join(' · ')}</span></span></a></li>`).join('') || '<li class="item muted">없다.</li>'}</ul></section>`;
  }

  // 왼쪽: 과목 목록
  const ex = examInfo();
  const side = SUBJECTS.map(s => {
    const ps = all.filter(p => p.subject === s.id);
    let qn = 0, tried = 0;
    for (const p of ps) { const st = packStats(p, prog, read); qn += st.qn; tried += st.tried; }
    const d = ex.subjects?.[s.id]?.date;
    return `<a class="sbj${s.id === sel ? ' on' : ''}${ps.length ? '' : ' empty'}" style="--tint:var(--t-${s.id})" href="#/study?s=${s.id}">${subjDot(s.id)}<span class="grow"><b>${s.name}</b><span class="small muted">${ps.length ? `자료 ${ps.length}` : '없음'}${d ? ` · ${dLabel(d)}` : ''}</span></span>${qn ? `<span class="mini-bar"><i style="width:${pct(tried, qn)}%"></i></span>` : ''}</a>`;
  }).join('');

  const card = (p, label) => {
    const st = packStats(p, prog, read);
    const per = st.qn ? pct(st.tried, st.qn) : 0;
    const badges = [st.notes ? '정리' : '', st.texts ? `원문 ${st.texts}` : '', st.qn ? `문제 ${st.qn}` : '', st.cards ? `카드 ${st.cards}` : ''].filter(Boolean);
    // 카드는 과목 색 대신 공부 상태로 구별한다: 하는 중 > 안 함 > 끝냄
    const done = st.read && (!st.qn || st.tried >= st.qn) && !st.wrong;
    const doing = !done && (st.tried > 0 || st.read || S.readTimeOf(p.id) > 0);
    return `<a class="pcard${doing ? ' is-doing' : done ? ' is-done' : ''}" href="#/pack?id=${encodeURIComponent(p.id)}">
      ${(label = shortUnit(label || unitOf(p))) && !p.title.includes(label) ? `<span class="pc-u small">${esc(label)}</span>` : ''}
      <div class="row between" style="gap:6px;align-items:flex-start"><b class="pc-t">${esc(p.title)}</b>${done ? '<span class="tag ok">끝냄</span>' : doing ? '<span class="tag vio">하는 중</span>' : ''}</div>
      <div class="pc-b small muted">${badges.map(esc).join(' · ')}<span class="pdfb" data-pdfb="${esc(p.id)}"></span></div>
      ${st.qn ? `<div class="pc-p"><span class="mini-bar wide"><i style="width:${per}%"></i></span><span class="small mono muted">${st.tried}/${st.qn}${st.wrong ? ` · <span style="color:var(--bad)">오답 ${st.wrong}</span>` : ''}</span></div>` : ''}
    </a>`;
  };

  let body;
  if (!packs.length) body = `<p class="muted" style="margin-top:16px">${SUBJ[sel].name} 자료가 아직 없다. <a href="#/settings">설정 → 자료 가져오기</a></p>`;
  else if (editing) body = `<div class="sec-title"><h2>순서 바꾸기</h2><span class="row"><button class="btn sm ghost" data-ord-reset="${sel}">원래 순서로</button><button class="btn sm pri" data-ord-done>다 했다</button></span></div>
    <section class="card flat"><ul class="list ordlist">${packs.map((p, i) => `<li class="item"><span class="mono small muted" style="width:2em">${i + 1}</span><span class="grow"><b>${esc(p.title)}</b></span>
      <button class="btn sm" data-mv="${esc(p.id)}" data-d="-1" ${i ? '' : 'disabled'} aria-label="위로">↑</button><button class="btn sm" data-mv="${esc(p.id)}" data-d="1" ${i < packs.length - 1 ? '' : 'disabled'} aria-label="아래로">↓</button></li>`).join('')}</ul></section>`;
  else if (catEdit) {
    const cats = myCats(sel);
    body = `<section class="card" style="margin-top:12px"><h3 style="margin-top:0">분류 만들기</h3>
      <p class="small muted">${SUBJ[sel].name} 자료를 나눌 분류 이름을 만든다. 순서는 ↑↓ 로, 이름은 칸을 고치면 바로 바뀐다. 분류를 지워도 자료는 지워지지 않고 "분류 안 됨" 으로 간다.</p>
      <ul class="list catrows">${cats.map((c, i) => `<li class="item"><input type="text" class="grow" data-cname="${c.id}" value="${esc(c.name)}" aria-label="분류 이름"><span class="small muted">${packs.filter(p => catOf(p) === c.id).length}개</span>
        <button class="btn sm" data-cmv="${c.id}" data-d="-1" ${i ? '' : 'disabled'} aria-label="위로">↑</button><button class="btn sm" data-cmv="${c.id}" data-d="1" ${i < cats.length - 1 ? '' : 'disabled'} aria-label="아래로">↓</button><button class="btn sm ghost bad" data-cdel="${c.id}">지우기</button></li>`).join('') || '<li class="item muted small">아직 분류가 없다.</li>'}</ul>
      <form id="cAdd" class="row" style="margin-top:8px"><input type="text" name="n" placeholder="새 분류 이름 (예: 학평, 교과서, 시험 직전)" style="flex:1"><button class="btn pri">추가</button></form>
    </section>
    <section class="card"><h3 style="margin-top:0">자료 나누기</h3>
      <p class="small muted">자료마다 들어갈 분류를 고른다. 고르면 바로 저장된다.</p>
      <ul class="list catrows">${packs.map(p => `<li class="item"><span class="grow"><b>${esc(p.title)}</b></span><select data-pcat="${esc(p.id)}"${cats.length ? '' : ' disabled'}><option value="">분류 안 됨</option>${cats.map(c => `<option value="${c.id}"${catOf(p) === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></li>`).join('')}</ul>
    </section>`;
  }
  else if (mode === 'mine' && !myCats(sel).length) {
    body = `<section class="card flat" style="margin-top:12px"><p>${SUBJ[sel].name} 에 내 분류가 아직 없다. "분류 관리" 에서 분류 이름을 만들고 자료를 나눠 넣는다. 예: 학평 / 교과서 / 실전 문제 / 시험 직전.</p><a class="btn pri" href="${link({ g: 'mine', edit: '1' })}">분류 만들기</a></section>`;
  }
  else {
    const groups = packGroups(packs, mode);
    const closed = S.load('studyClosed', {});
    // 자료가 하나뿐인 묶음이 이어지면 머리줄 없이 한 칸에 모은다 (카드 위에 단원 이름)
    const parts = [];
    for (const g of groups) {
      if (mode !== 'mine' && g.packs.length === 1 && groups.length > 2) { const last = parts[parts.length - 1]; if (last && last.singles) last.items.push(g); else parts.push({ singles: true, items: [g] }); }
      else parts.push(g);
    }
    body = parts.map(g => {
      if (g.singles) return `<div class="pgrid" style="margin-top:12px">${g.items.map(x => card(x.packs[0], x.name)).join('')}</div>`;
      let qn = 0, tried = 0;
      for (const p of g.packs) { const st = packStats(p, prog, read); qn += st.qn; tried += st.tried; }
      const gk = sel + '|' + mode + '|' + g.name;
      return `<details class="pgroup"${closed[gk] ? '' : ' open'} data-gk="${esc(gk)}"><summary><span class="grow"><b>${esc(mode === "unit" ? shortUnit(g.name) : g.name)}</b> <span class="small muted">${g.packs.length}개${qn ? ` · 문제 ${tried}/${qn}` : ''}</span></span>${qn ? `<span class="mini-bar"><i style="width:${pct(tried, qn)}%"></i></span>` : ''}</summary>
        <div class="pgrid">${g.packs.map(p => card(p)).join('') || '<p class="small muted">비어 있다. 자료 화면의 "분류" 나 "분류 관리" 에서 넣는다.</p>'}</div></details>`;
    }).join('');
  }

  main.innerHTML = `
  <div class="row between" style="align-items:center"><h1 style="margin:0">공부자료</h1><a class="small" href="#/pdf?s=${sel}">PDF 원본 <span id="pdfCount"></span> ›</a></div>
  <form id="sf" class="row" style="margin:10px 0"><input type="search" name="q" aria-label="자료 찾기" placeholder="모든 자료, 문제, 카드에서 찾기" value="${esc(term)}" style="flex:1"><button class="btn">찾기</button></form>
  ${results}
  <div class="study-wrap">
    <nav class="study-side" aria-label="과목">${side}</nav>
    <section class="study-main">
      <div class="row between study-head"><h2 style="margin:0">${subjDot(sel)} ${SUBJ[sel].name}</h2>
        ${packs.length && !editing ? `<span class="row"><span class="seg"><a class="${mode === 'mine' ? 'on' : ''}" href="${link({ g: 'mine' })}">내 분류</a><a class="${mode === 'unit' ? 'on' : ''}" href="${link({ g: 'unit' })}">단원별</a><a class="${mode === 'kind' ? 'on' : ''}" href="${link({ g: 'kind' })}">종류별</a></span>${mode === 'mine' ? `<a class="btn sm${catEdit ? ' pri' : ''}" href="${link(catEdit ? { g: 'mine' } : { g: 'mine', edit: '1' })}">${catEdit ? '다 했다' : '분류 관리'}</a>` : ''}${packs.length > 1 ? `<a class="btn sm ghost" href="${link({ order: sel })}">순서</a>` : ''}</span>` : ''}</div>
      ${!editing && mode === 'unit' && units.size < 2 && packs.length > 3 ? '<p class="small muted" style="margin:6px 0 0">단원이 하나라 다 같이 보인다. 자료 화면 제목 옆 "단원 정하기" 로 단원을 나누거나, "종류별" 로 본다.</p>' : ''}
      ${body}
    </section>
  </div>`;

  if (catEdit) {
    const again = () => { render.keepScroll = true; render(); };
    $('#cAdd').addEventListener('submit', e => { e.preventDefault(); if (addCat(sel, e.target.n.value)) again(); });
    $$('[data-cname]').forEach(inp => inp.addEventListener('change', () => { const v = inp.value.trim(); if (!v) return again(); saveCats(sel, myCats(sel).map(c => c.id === inp.dataset.cname ? { ...c, name: v } : c)); toast('이름을 바꿨다.'); }));
    $$('[data-cmv]').forEach(b => b.addEventListener('click', () => { const cs = myCats(sel).slice(); const i = cs.findIndex(c => c.id === b.dataset.cmv), j = i + Number(b.dataset.d); if (j < 0 || j >= cs.length) return; [cs[i], cs[j]] = [cs[j], cs[i]]; saveCats(sel, cs); again(); }));
    $$('[data-cdel]').forEach(b => b.addEventListener('click', () => { const c = myCats(sel).find(x => x.id === b.dataset.cdel); if (!c || !confirm(`"${c.name}" 분류를 지울까? 안에 있던 자료는 "분류 안 됨" 으로 간다.`)) return; saveCats(sel, myCats(sel).filter(x => x.id !== c.id)); again(); }));
    $$('[data-pcat]').forEach(sl => sl.addEventListener('change', () => { setCatOf(sl.dataset.pcat, sl.value); toast('저장했다.'); }));
  }
  $$('.pgroup').forEach(d => d.addEventListener('toggle', () => { const c = S.load('studyClosed', {}); if (d.open) delete c[d.dataset.gk]; else c[d.dataset.gk] = 1; S.save('studyClosed', c); }));
  PDF.listPdfs().then(l => {
    const el = document.getElementById('pdfCount'); const n = l.filter(x => x.subject === sel).length; if (el && n) el.textContent = `${n}개`;
    const byPack = {}; for (const x of l) if (x.pack) byPack[x.pack] = (byPack[x.pack] || 0) + 1;
    $$('[data-pdfb]').forEach(b => { const k = byPack[b.dataset.pdfb]; if (k) b.textContent = ` · PDF ${k}`; });
  });
  const back = '#/study?s=' + sel;
  $$('[data-mv]').forEach(b => b.addEventListener('click', async () => {
    const p = D.db().byId[b.dataset.mv];
    const ids = D.db().packs.filter(x => x.subject === p.subject).map(x => x.id);
    const i = ids.indexOf(p.id), j = i + Number(b.dataset.d);
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    D.savePackOrder(p.subject, ids);
    await D.loadAll();
    render.keepScroll = true; render();
  }));
  $('[data-ord-done]')?.addEventListener('click', () => { location.hash = back; });
  $('[data-ord-reset]')?.addEventListener('click', async e => {
    if (!confirm('이 과목 자료를 원래 순서로 돌릴까?')) return;
    D.savePackOrder(e.currentTarget.dataset.ordReset, null);
    await D.loadAll(); render.keepScroll = true; render();
  });
  $('#sf').addEventListener('submit', e => {
    e.preventDefault();
    const v = e.target.q.value.trim();
    location.hash = link(v ? { q: v } : {});
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
    // 스톱워치가 돌고 있으면 그 시간이 이미 공부 시간에 들어가므로 읽은 시간을 따로 세지 않는다 (두 번 세지 않게)
    if (this.pack && document.visibilityState === 'visible' && now - this.active < 90000 && !S.load('mclock', null)) this.sec += (now - this.last) / 1000;
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
  const srcOn = q.get('src') || q.get('srcedit') ? true : (srcPref == null ? texts.length > 0 : srcPref);
  let curTid = q.get('src') || S.load('srcTab', {})[p.id];
  if (!texts.find(t => t.tid === curTid)) curTid = texts[0]?.tid;
  const cur = texts.find(t => t.tid === curTid);
  const lnOn = S.load('srcLn', false);
  const notesMarks = marks.filter(h => !h.where);
  const srcMarks = cur ? marks.filter(h => h.where === 'src:' + cur.tid) : [];
  const srcPane = `<section class="card src-pane" id="srcPane">
    <div class="row between"><b>본문</b><span class="row">${cur ? `<label class="small"><input type="checkbox" id="lnOn"${lnOn ? ' checked' : ''}> 행 번호</label>` : ''}<details class="menu"><summary class="btn sm ghost">편집</summary><div class="menu-pop">${cur ? '<button type="button" class="mi" id="srcEdit">이 원문 고치기</button>' : ''}<button type="button" class="mi" id="srcAdd">원문 붙여넣기</button><button type="button" class="mi" data-file="srcImg">교과서 사진 넣기</button></div></details><input type="file" id="srcImg" accept="image/*" multiple hidden></span></div>
    ${texts.length > 1 ? `<div class="chips" style="margin:8px 0" role="group" aria-label="볼 원문">${texts.map(t => `<button type="button" class="chip${t.tid === curTid ? ' on' : ''}" aria-pressed="${t.tid === curTid}" data-tid="${esc(t.tid)}">${esc(t.title)}</button>`).join('')}</div>` : ''}
    ${cur ? `<p class="small muted" style="margin:6px 0">${esc(cur.title)}${cur.mine ? ' · 내가 넣거나 고친 본문' : ''}</p>
      <div class="src-text${lnOn ? ' ln' : ''}" id="srcText">${cur.body.split('\n').map(line => line.trim() ? `<div class="l">${srcLine(line)}</div>` : '<div class="l e"></div>').join('')}</div>`
      : `<p class="small muted">아직 본문이 없다. "편집 → 원문 붙여넣기" 로 원문을 넣거나 "교과서 사진 넣기" 로 사진을 올린다. 공부 Claude 프롬프트로 받은 자료에는 본문이 같이 들어 있다.</p>`}
    <div id="srcImgs" class="src-imgs"></div>
  </section>`;

  // 영어: 책 문제가 있으면 먼저 풀어야 공부자료가 열린다
  const book = p.book || [];
  const bookDone = S.kvGet('bookdone', p.id) || (p._mergedFrom || []).map(m => S.kvGet('bookdone', m.id)).find(Boolean) || null;
  if (p.subject === 'eng' && book.length && !bookDone && !q.get('peek')) {
    const pages = [...new Set(book.map(b => (String(b.source || b.page || '').match(/\d+\s*쪽/) || [])[0]).filter(Boolean))];
    main.innerHTML = `
    <p class="small"><a href="#/study?s=${p.subject}">← ${subjName(p.subject)}</a></p>
    <h1 class="ptitle">${esc(p.title)}</h1>${p._title ? `<p class="small muted" style="margin-top:-6px">원래 이름: ${esc(p._title)}</p>` : ''}
    <section class="card book-gate">
      <h2>먼저 책 문제를 푼다</h2>
      <p>공부자료를 보기 전에 책 문제 <b>${book.length}개</b>를 먼저 풀어 본다. 다 풀고 채점하면 공부자료가 열린다. 모르는 문제는 "모르겠다" 로 넘긴다.</p>
      ${pages.length ? `<p class="small muted">책 ${esc(pages.length > 2 ? pages[0] + ' ~ ' + pages[pages.length - 1] : pages.join(', '))}</p>` : ''}
      <div class="row"><a class="btn pri" href="#/run?book=${encodeURIComponent(p.id)}">책 문제 ${book.length}개 풀기</a><a class="btn ghost" href="#/pack?id=${encodeURIComponent(p.id)}&peek=1">그냥 공부자료 보기</a>${packMenu(p)}</div>
    </section>
    ${(p._mergedFrom || []).length ? `<p class="small muted">책 문제는 ${p._mergedFrom.map(m => esc(m.title)).join(', ')} 에서 합쳐 왔다. 나누려면 "그냥 공부자료 보기" 에서 "따로 보기".</p>` : ''}`;
    return;
  }

  main.innerHTML = `
  <p class="small"><a href="#/study?s=${p.subject}">← ${subjName(p.subject)}</a></p>
  <h1 class="ptitle">${esc(p.title)}</h1>${p._title ? `<p class="small muted" style="margin-top:-6px">원래 이름: ${esc(p._title)}</p>` : ''}
  ${book.length ? `<p class="small">${bookDone && !bookDone.skipped ? `책 문제 <b>${bookDone.ok}/${bookDone.n}</b> 맞힘 · ${S.fmtDate(S.dayOf(bookDone.t))} · ` : ''}<a href="#/run?book=${encodeURIComponent(p.id)}">책 문제 ${book.length}개 ${bookDone ? '다시 ' : ''}풀기</a></p>` : ''}
  <div class="row small muted" style="margin-bottom:10px">${subjDot(p.subject)} ${subjName(p.subject)}${p.unit ? ' · ' + esc(p.unit) : ''}${p.updated ? ' · ' + esc(String(p.updated).slice(0, 10)) : ''}${p._src === 'local' ? ' <span class="tag vio">내 기기에 가져온 자료</span>' : ''}</div>
  ${p.summary ? `<p class="note info">${esc(p.summary)}</p>` : ''}
  <p class="small noprint" id="packPdfs" hidden></p>
  ${(p._mergedFrom || []).length ? `<p class="small muted noprint">합친 자료: ${p._mergedFrom.map(m => `${esc(m.title)}${m.auto ? ' (같은 단원이라 저절로)' : ''} <button class="btn sm ghost" data-unmerge="${esc(m.id)}">따로 보기</button>`).join(' · ')}</p>` : ''}

  <div class="row noprint" style="margin:12px 0">
    ${qs.length ? `<a class="btn pri" href="#/run?pack=${encodeURIComponent(p.id)}">문제 ${qs.length}개 풀기</a>` : ''}
    ${(p.cards || []).length ? `<a class="btn" href="#/flash?pack=${encodeURIComponent(p.id)}">암기카드 ${p.cards.length}장</a>` : ''}
    ${p.notes ? `<a class="btn" href="#/blank?pack=${encodeURIComponent(p.id)}" title="자료를 안 보고 기억나는 것을 다 써 본 뒤 비교한다">백지 복습</a>` : ''}
    <button class="btn" id="srcBtn" aria-pressed="${srcOn}">본문 같이 보기${texts.length > 1 ? ` <span class="small">원문 ${texts.length}개</span>` : ''}</button>
    <button class="btn ghost" id="readBtn" aria-pressed="${!!read[p.id]}">${read[p.id] ? '다 읽음 ✓' : '다 읽음 표시'}</button>
    ${packMenu(p, `<a class="mi" href="#/gen?pack=${encodeURIComponent(p.id)}">AI 문제 더 만들기</a><button type="button" class="mi" id="printBtn">인쇄</button>`)}
  </div>
  <p class="small muted">읽은 시간 <b id="readNow">${S.fmtDur(S.readTimeOf(p.id))}</b> (${readEvents.length}번)${readEvents.length ? ` · 마지막 ${S.fmtDate(S.dayOf(readEvents[readEvents.length - 1].t))}` : ''}${qs.length ? ` · 객관식 ${cnt('mcq')} · 단답형 ${cnt('short')} · 서술형 ${cnt('essay')} · 푼 문제 ${tried}/${qs.length} · 정답률 ${n ? pct(ok, n) + '%' : '-'}` : ''}</p>
  ${pos && pos.r > 0.05 && !hl ? `<p class="noprint"><button class="btn sm" id="resumeBtn">지난번 읽던 곳으로 (${Math.round(pos.r * 100)}%)</button></p>` : ''}
  <div class="pack-layout${srcOn ? ' src-on' : ''}">${srcOn ? srcPane : ''}<div class="pack-main">
  <p class="small muted noprint" style="margin:0 0 6px">글자를 길게 눌러 고르면 형광펜·메모를 남길 수 있다${srcOn ? ' (본문에도 된다)' : ''}.</p>
  <article class="card notes" id="notes">${p.notes ? md(p.notes) : '<p class="muted">본문이 없는 자료다.</p>'}</article>
  ${(p.cards || []).length ? `<details class="card flat"><summary>암기 항목 ${p.cards.length}개 한눈에 보기</summary><table class="crit">${p.cards.map(c => `<tr><td><b>${esc(c.front)}</b></td><td>${esc(c.back)}</td></tr>`).join('')}</table></details>` : ''}
  </div>
  ${srcOn ? '</div>' : ''}<aside class="pack-side${srcOn ? ' below' : ''}">
  <section class="card noprint">
    <h2>내 단원 메모</h2>
    <textarea id="pnote" aria-label="내 단원 메모" placeholder="이 단원에서 기억할 것, 선생님이 강조한 것, 헷갈리는 것" style="min-height:90px">${esc(memo?.text || '')}</textarea>
    <p class="small muted" id="pnoteInfo">${memo ? '저장됨 · ' + S.fmtDate(S.dayOf(memo.u)) + ' ' + S.fmtTime(memo.u) : '쓰면 바로 저장된다.'}</p>
  </section>
  <section class="card noprint">
    <div class="row between"><h2 style="margin:0">형광펜·메모 ${marks.length}</h2><a class="small" href="#/marks?pack=${encodeURIComponent(p.id)}">모아보기</a></div>
    <ul class="list" id="markList">${marks.map(h => `<li><a class="item" href="#" data-goto="${h.id}"><span class="hl-sw hl-${h.color}"></span><span class="grow small">${h.where ? '<span class="tag">본문</span> ' : ''}${esc(h.text.slice(0, 60))}${h.text.length > 60 ? '…' : ''}${h.note ? `<br><span class="muted">메모: ${esc(h.note)}</span>` : ''}</span></a></li>`).join('') || '<li class="item small muted">아직 없다.</li>'}</ul>
  </section>
  <section class="card noprint">
    <h2>이 자료에 대해 묻기</h2>
    ${AI.hasKey() ? '' : '<p class="small muted">API 키가 없으면 "채팅으로 묻기" 를 누른다. 자료 본문과 질문이 같이 복사되니 claude.ai 나 공부 Claude 채팅에 붙여넣는다.</p>'}
    <div id="chat">${hist.map(h => `<p><b>나:</b> ${esc(h.q)}</p><div class="notes" style="margin-bottom:12px">${md(h.a)}</div>`).join('')}</div>
    <form id="askf"><textarea name="q" rows="3" aria-label="이 자료에 대해 물을 것" placeholder="예: 이 시에서 화자의 태도가 바뀌는 부분이 어디야?" style="min-height:80px"></textarea>
    <pre class="prompt" id="askPre" hidden></pre>
    <div class="row" style="margin-top:8px">${AI.hasKey() ? '<button class="btn pri">묻기</button>' : '<button type="button" class="btn pri" id="askCopy">채팅으로 묻기 (복사)</button> <a class="btn ghost" href="https://claude.ai/new" target="_blank" rel="noopener">claude.ai 열기</a>'}${hist.length ? '<button type="button" class="btn ghost sm" id="clearChat">대화 지우기</button>' : ''}</div></form>
  </section></aside>${srcOn ? '' : '</div>'}
  `;
  $$('[data-unmerge]').forEach(b => b.addEventListener('click', async () => {
    D.unmergePack(b.dataset.unmerge); await D.loadAll(); toast('따로 보게 했다.'); render.keepScroll = true; render();
  }));
  // 이 자료에 이어 둔 PDF 원본 (이 기기에 있는 것만)
  PDF.listPdfs().then(l => {
    const mine = l.filter(x => x.pack === p.id);
    const el = document.getElementById('packPdfs');
    if (!el || !mine.length) return;
    el.hidden = false;
    el.innerHTML = 'PDF 원본: ' + mine.map(x => `<a class="btn sm" href="#/pdf?id=${x.id}">${esc(x.title)} 보기</a>`).join(' ');
  });
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
  $('#srcBtn').addEventListener('click', () => { S.save('srcOn', !srcOn); render.keepScroll = true; render(); $('#srcBtn')?.focus({ preventScroll: true }); });
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
    // 다시 그린 뒤에도 고른 원문 탭에 초점을 둔다
    setTimeout(() => document.querySelector(`#srcPane [data-tid="${CSS.escape(c.dataset.tid)}"]`)?.focus({ preventScroll: true }), 120);
  }));
  $('#lnOn')?.addEventListener('change', e => { S.save('srcLn', e.target.checked); $('#srcText').classList.toggle('ln', e.target.checked); });
  $('#srcAdd').addEventListener('click', () => openSrcDialog(p, null));
  // 문제 화면의 '원문 넣으러 가기' 로 왔으면 바로 붙여넣기 창을 연다
  if (params().q.get('srcedit')) { history.replaceState(null, '', `#/pack?id=${encodeURIComponent(p.id)}`); openSrcDialog(p, null); }
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

// 분류 정하기: 이 과목의 내 분류 중 하나를 고르거나 새로 만든다
document.addEventListener('click', e => {
  const b = e.target.closest('[data-catopen]');
  if (!b) return;
  const p = D.db().byId[b.dataset.catopen];
  if (!p) return;
  const cats = myCats(p.subject), cur = catOf(p);
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg';
  dlg.innerHTML = `<form method="dialog"><h2 style="margin-top:0">분류</h2>
    <p class="small">"${esc(p.title)}" 을 넣을 ${subjName(p.subject)} 분류를 고른다.</p>
    <div class="chips" style="margin:8px 0">${cats.map(c => `<label class="chip"><input type="radio" name="cat" value="${c.id}"${c.id === cur ? ' checked' : ''}>${esc(c.name)}</label>`).join('')}<label class="chip"><input type="radio" name="cat" value=""${cur ? '' : ' checked'}>분류 안 됨</label></div>
    <label class="field"><span>새 분류 만들어 넣기</span><input type="text" id="catNew" placeholder="새 분류 이름 (비우면 위에서 고른 것)"></label>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" value="no">닫기</button><button class="btn pri" value="ok">저장</button></div></form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => {
    const r = dlg.returnValue, nn = dlg.querySelector('#catNew').value.trim(), pick = dlg.querySelector('input[name="cat"]:checked')?.value || '';
    dlg.remove();
    if (r !== 'ok') return;
    const id = nn ? addCat(p.subject, nn) : pick;
    setCatOf(p.id, id);
    S.save('studyGroup:' + p.subject, 'mine');
    toast(id ? '분류에 넣었다.' : '분류에서 뺐다.'); render.keepScroll = true; render();
  });
  dlg.showModal();
});

// 단원 정하기: 자료 목록의 "단원별" 묶음 이름. 비우면 자료에 원래 있던 단원으로
document.addEventListener('click', e => {
  const b = e.target.closest('[data-unitopen]');
  if (!b) return;
  const p = D.db().byId[b.dataset.unitopen];
  if (!p) return;
  const have = [...new Set(D.db().packs.filter(x => x.subject === p.subject).map(unitOf).filter(Boolean))];
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg';
  dlg.innerHTML = `<form method="dialog"><h2 style="margin-top:0">단원 정하기</h2>
    <p class="small">자료 목록에서 "단원별" 로 볼 때 "${esc(p.title)}" 이 들어갈 묶음이다. 있는 단원을 고르거나 새 이름을 쓴다.</p>
    <label class="field"><span>단원</span><input type="text" id="unIn" list="unList" value="${esc(unitOf(p))}" placeholder="예: 1과, Ⅲ단원, 학평"><datalist id="unList">${have.map(u => `<option value="${esc(u)}">`).join('')}</datalist></label>
    ${have.length ? `<div class="chips" style="margin:6px 0">${have.map(u => `<button type="button" class="chip" data-un="${esc(u)}">${esc(u)}</button>`).join('')}</div>` : ''}
    <div class="row" style="justify-content:flex-end;margin-top:12px">${S.kvGet('punit', p.id) ? '<button class="btn ghost" value="reset">원래대로</button>' : ''}<button class="btn ghost" value="no">닫기</button><button class="btn pri" value="ok">저장</button></div></form>`;
  document.body.appendChild(dlg);
  dlg.querySelectorAll('[data-un]').forEach(c => c.addEventListener('click', () => { dlg.querySelector('#unIn').value = c.dataset.un; }));
  dlg.addEventListener('close', () => {
    const v = dlg.querySelector('#unIn').value.trim(), r = dlg.returnValue;
    dlg.remove();
    if (r === 'reset') S.kvDel('punit', p.id);
    else if (r === 'ok') { if (v) S.kvSet('punit', p.id, { unit: v }); else S.kvDel('punit', p.id); }
    else return;
    toast('단원을 정했다.'); render.keepScroll = true; render();
  });
  dlg.showModal();
});

// 메뉴에서 키보드 초점이 빠져나가면 닫는다
document.addEventListener('focusout', e => {
  const d = e.target.closest?.('details.menu[open]');
  if (d && !d.contains(e.relatedTarget)) d.open = false;
});
// 파일 고르기 버튼: 숨긴 파일 칸을 연다 (label 로 감싸면 키보드로 못 닿는다)
document.addEventListener('click', e => {
  const b = e.target.closest('[data-file]');
  if (b) document.getElementById(b.dataset.file)?.click();
});
// 펼친 메뉴는 바깥을 누르거나, 메뉴 안의 항목을 누르거나, Esc 를 누르면 닫는다
document.addEventListener('click', e => {
  document.querySelectorAll('details.menu[open]').forEach(d => { if (!d.contains(e.target) || e.target.closest('.mi')) d.open = false; });
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (selBar && selBar.style.display === 'flex') { hideSelBar(); getSelection().removeAllRanges(); return; }
  const d = document.querySelector('details.menu[open]');
  if (d) { d.open = false; d.querySelector('summary').focus(); }
});
// 자료 관리 메뉴: 이름 바꾸기·분류·합치기처럼 가끔 쓰는 일은 공부 버튼 옆에 늘어놓지 않고 여기 모은다
function packMenu(p, extra = '') {
  const cat = catOf(p) ? myCats(p.subject).find(c => c.id === catOf(p))?.name || '' : '';
  return `<details class="menu noprint"><summary class="btn ghost" aria-label="자료 관리 메뉴"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>관리</summary>
    <div class="menu-pop">${extra}
      <button type="button" class="mi" data-rename="${esc(p.id)}">이름 바꾸기</button>
      <button type="button" class="mi" data-catopen="${esc(p.id)}">분류${cat ? `<span class="muted">${esc(cat)}</span>` : ''}</button>
      <button type="button" class="mi" data-mergeopen="${esc(p.id)}">다른 자료에 합치기</button>
    </div></details>`;
}

// 자료 합치기 대화상자: 이 자료의 정리·문제·책 문제·카드·원문을 고른 자료 뒤에 붙인다
document.addEventListener('click', e => {
  const b = e.target.closest('[data-mergeopen]');
  if (!b) return;
  const p = D.db().byId[b.dataset.mergeopen];
  if (!p) return;
  const others = D.db().packs.filter(x => x.subject === p.subject && x.id !== p.id);
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg';
  dlg.innerHTML = `<form method="dialog"><h2 style="margin-top:0">다른 자료에 합치기</h2>
    <p class="small">"${esc(p.title)}" 의 정리·문제·책 문제·카드·원문을 아래 자료 뒤에 붙인다. 이 자료는 목록에서 빠지고, 푼 기록은 그대로 이어진다. 합친 자료 화면의 "따로 보기" 로 언제든 되돌린다.</p>
    ${others.length ? `<label class="field"><span>붙일 자료 (${subjName(p.subject)})</span><select id="mgTo">${others.map(x => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('')}</select></label>` : '<p class="note">같은 과목에 다른 자료가 없다.</p>'}
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ghost" value="no">닫기</button>${others.length ? '<button class="btn pri" value="ok">합치기</button>' : ''}</div></form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', async () => {
    const to = dlg.querySelector('#mgTo')?.value;
    const ok = dlg.returnValue === 'ok';
    dlg.remove();
    if (!ok || !to) return;
    D.mergePack(p.id, to); await D.loadAll(); toast('합쳤다.');
    location.hash = '#/pack?id=' + encodeURIComponent(to);
  });
  dlg.showModal();
});

// 자료 이름 바꾸기. 이 기기와 동기화된 기기에서만 바뀌고 자료 파일은 그대로다
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-rename]');
  if (!b) return;
  const p = D.db().byId[b.dataset.rename];
  if (!p) return;
  const t = prompt(`새 이름을 쓴다. 비워 두면 원래 이름(${p._title || p.title})으로 돌아간다.`, p.title);
  if (t === null) return;
  D.renamePack(p.id, t);
  await D.loadAll();
  toast(t.trim() ? '이름을 바꿨다.' : '원래 이름으로 돌렸다.');
  render.keepScroll = true; render();
});

// ---------- 형광펜: 고르면 아래에 도구 띠가 뜬다 ----------
let selBar = null;
function hideSelBar() { if (selBar) selBar.style.display = 'none'; }
function bindSelection(roots, pack) {
  if (!selBar) {
    selBar = document.createElement('div');
    selBar.className = 'selbar noprint';
    selBar.innerHTML = `${HL.COLORS.map(c => `<button type="button" data-c="${c.id}" class="hl-btn hl-${c.id}" aria-label="${c.name} 형광펜">${c.name}</button>`).join('')}<button type="button" data-memo class="btn sm">메모</button><button type="button" data-quick class="btn sm ghost" title="켜면 글자를 고르기만 해도 칠해진다">바로 칠하기</button><button type="button" data-x class="btn sm ghost" aria-label="닫기">✕</button>`;
    document.body.appendChild(selBar);
    quickPill = document.createElement('button');
    quickPill.type = 'button';
    quickPill.className = 'quickpill noprint';
    quickPill.onclick = () => { S.save('hlQuick', null); syncQuick(); toast('바로 칠하기를 껐다.'); };
    document.body.appendChild(quickPill);
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
  const paint = (f, color, memo) => {
    const a = f.a;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    S.kvSet('hl', id, { id, pack: pack.id, subject: pack.subject, text: a.text, prefix: a.prefix, suffix: a.suffix, color, note: '', c: Date.now(), ...(f.where ? { where: f.where } : {}) });
    window.getSelection().removeAllRanges();
    hideSelBar();
    render.keepScroll = true; render();
    if (memo) setTimeout(() => openMarkDialog(id), 50);
    else toast(`${HL.COLORS.find(c => c.id === color)?.name || ''} 형광펜을 칠했다.`, 5000, { label: '되돌리기', fn: () => { S.kvDel('hl', id); render.keepScroll = true; render(); } });
  };
  let quickT = 0;
  const onSel = () => {
    const f = find();
    clearTimeout(quickT);
    const qc = S.load('hlQuick', null);
    if (f && qc) {
      // 바로 칠하기: 고르기를 멈추고 잠깐 기다렸다가 칠하고 선택을 푼다. 선택이 풀리면 브라우저의 복사 메뉴와 검색 창도 닫힌다.
      hideSelBar();
      quickT = setTimeout(() => { const g = find(); if (g && g.a.text.trim().length > 1) paint(g, qc, false); }, 900);
      return;
    }
    if (f) { anchor = f.a; where = f.where; selBar.style.display = 'flex'; placeSelBar(); }
    else if (!selBar.contains(document.activeElement)) { selBar.style.display = 'none'; }
  };
  document.onselectionchange = onSel;
  syncQuick();
  selBar.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-x')) { window.getSelection().removeAllRanges(); hideSelBar(); return; }
    const f = anchor ? { a: anchor, where } : find();
    if (!f) return hideSelBar();
    if (b.hasAttribute('data-quick')) {
      const c = S.load('hlLast', 'y');
      S.save('hlQuick', c);
      paint(f, c, false);
      toast('바로 칠하기를 켰다. 이제 글자를 고르기만 하면 칠해진다. 끌 때는 아래 띠를 누른다.');
      syncQuick();
      return;
    }
    const color = b.dataset.c || S.load('hlLast', 'y');
    if (b.dataset.c) S.save('hlLast', b.dataset.c);
    paint(f, color, b.hasAttribute('data-memo'));
  };
}
let quickPill = null;
// 바로 칠하기가 켜져 있으면 자료 화면 아래에 색과 끄기 버튼을 보여 준다
function syncQuick() {
  if (!quickPill) return;
  const qc = S.load('hlQuick', null);
  const on = qc && /^#\/pack/.test(location.hash);
  quickPill.style.display = on ? 'flex' : 'none';
  if (on) {
    const c = HL.COLORS.find(x => x.id === qc) || HL.COLORS[0];
    quickPill.innerHTML = `<span class="hl-btn hl-${c.id}" style="pointer-events:none">${c.name}</span> 바로 칠하기 켜짐 · 끄기`;
  }
}
window.addEventListener('hashchange', () => syncQuick());

// 형광펜 띠 위치: 휴대폰·태블릿 브라우저는 고른 글자 바로 위에 복사 메뉴를, 화면 아래에 "Google 검색" 창을 띄운다.
// 둘 다 피하려고 고른 글자가 화면 아래쪽이면 화면 맨 위(머리띠 아래)에, 위쪽이면 고른 글자 조금 아래에 띄운다.
function placeSelBar() {
  try {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const vh = window.innerHeight;
    const headH = (document.querySelector('.top')?.getBoundingClientRect().bottom || 56) + 8;
    let top;
    if (r.top > headH + 130) top = headH;
    else top = Math.min(r.bottom + 64, vh * 0.55);
    selBar.style.top = Math.round(top) + 'px';
    selBar.style.bottom = 'auto';
  } catch (e) {}
}
window.addEventListener('scroll', () => { if (selBar && selBar.style.display === 'flex') placeSelBar(); }, { passive: true });

// 형광펜 하나를 눌렀을 때: 색 바꾸기, 메모, 지우기
function openMarkDialog(id) {
  const h = S.kvGet('hl', id);
  if (!h) return;
  let dlg = document.getElementById('markDlg');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'markDlg'; dlg.className = 'dlg'; document.body.appendChild(dlg); }
  dlg.innerHTML = `<form method="dialog">
    <p class="small muted" style="margin:0">${subjName(h.subject)} · ${esc(D.db().byId[h.pack]?.title || '')} · ${S.fmtDate(S.dayOf(h.c))}</p>
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
  main.innerHTML = `<div class="narrow">
  <h1>문제 풀기</h1>
  <form id="qf" class="card">
    <h2 class="h3">과목</h2>${chipGroup('subject', SUBJECTS.filter(s => packs.some(p => p.subject === s.id)).map(s => ({ value: s.id, label: s.name, dot: true })), last.subject)}
    <div id="packChips"></div>
    <h2 class="h3" style="margin-top:14px">유형</h2>${chipGroup('types', Object.entries(TYPE_NAME).map(([v, l]) => ({ value: v, label: l })), last.types)}
    <h2 class="h3" style="margin-top:14px">어떤 문제</h2>${chipGroup('src', [
      { value: 'all', label: '전체' }, { value: 'new', label: '안 푼 문제' }, { value: 'wrong', label: '오답만' },
      { value: 'due', label: '복습할 때 된 문제' }, { value: 'star', label: '헷갈림 표시' }], [last.src], false)}
    <div class="grid" style="margin-top:14px">
      <label class="field"><span>개수</span><select name="count">${['5', '10', '20', '30', 'all'].map(v => `<option value="${v}"${last.count === v ? ' selected' : ''}>${v === 'all' ? '전부' : v + '문제'}</option>`).join('')}</select></label>
      <label class="field"><span>순서</span><select name="order"><option value="shuffle"${last.order === 'shuffle' ? ' selected' : ''}>섞기</option><option value="seq"${last.order === 'seq' ? ' selected' : ''}>자료 순서대로</option></select></label>
      <label class="field"><span>방식</span><select name="mode"><option value="practice"${last.mode === 'practice' ? ' selected' : ''}>연습 · 바로 채점</option><option value="exam"${last.mode === 'exam' ? ' selected' : ''}>실전 · 시간 재고 끝에 채점</option></select></label>
      <label class="field" id="minField"><span>제한 시간(분)</span><input type="number" name="minutes" min="1" max="180" value="${esc(last.minutes)}"></label>
    </div>
    <p id="qcount" class="small muted"></p>
    <button class="btn pri block" style="margin-top:6px">시작</button>
  </form></div>`;

  const drawPacks = () => {
    const subs = picked('subject');
    const keep = picked('packs');
    const sel = keep.length ? keep : last.packs;
    // 과목을 골랐을 때만 그 과목 자료를 단원별로 보여 준다 (전부 펼치면 너무 많다)
    $('#packChips').innerHTML = !subs.length ? '<p class="small muted" style="margin:8px 0 0">안 고르면 모든 과목에서 낸다. 과목을 고르면 단원도 고를 수 있다.</p>'
      : '<h2 class="h3" style="margin-top:14px">단원</h2>' + SUBJECTS.filter(sb => subs.includes(sb.id)).map(sb => {
        const groups = packGroups(packs.filter(p => p.subject === sb.id), S.load('studyGroup:' + sb.id, 'unit'));
        return groups.map(g => `<div class="chip-group"><span class="small muted">${subs.length > 1 ? sb.name + ' · ' : ''}${esc(g.name)}</span>${chipGroup('packs', g.packs.map(p => ({ value: p.id, label: p.title })), sel)}</div>`).join('');
      }).join('') + '<p class="small muted">자료를 안 고르면 고른 과목 전체에서 낸다.</p>';
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

function startSession(items, mode = 'practice', minutes = 30, opts = {}) {
  session = {
    ...opts,
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
  if (q.get('src') || q.get('pack') || q.get('book')) {
    let items;
    if (q.get('src') === 'due') items = shuffle(dueItems());
    else if (q.get('src') === 'wrong') items = shuffle(wrongItems());
    else if (q.get('book')) {
      const bp = D.db().byId[q.get('book')];
      items = bp ? (bp.book || []).map(qq => ({ pack: bp, q: qq, key: D.qkey(bp, qq), book: true })) : [];
      if (items.length) { session = null; startSession(items, 'practice', 30, { bookPack: bp.id }); return; }
    }
    else items = D.allQuestions({ packs: [q.get('pack')], book: false });
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
    const word = r ? { ok: '맞음', part: '부분 점수', wrong: '틀림' }[r.result] || '채점 필요' : cls.includes('done') ? '답함' : '';
    return `<button type="button" data-go="${i}" class="${cls}"${i === session.i ? ' aria-current="step"' : ''} aria-label="${i + 1}번${word ? ' ' + word : ''}">${i + 1}</button>`;
  }).join('')}</div>`;
}

// 지금 보고 있는 문제에 머문 시간을 더한다
function tickSpent() {
  if (!session) return;
  const now = Date.now();
  if (session.cur && document.visibilityState === 'visible') session.spent[session.cur.i] = (session.spent[session.cur.i] || 0) + Math.min(now - session.cur.since, 15 * 60000);
  session.cur = session.submitted || session.results[session.i] ? null : { i: session.i, since: now };
}

// 다시 그려도 키보드 초점이 있던 자리를 잃지 않게: 같은 버튼이 있으면 거기, 채점 뒤면 '다음'으로
function focusKey(el) {
  if (!el || el === document.body || !main.contains(el)) return null;
  for (const a of ['data-ch', 'data-conf', 'data-go', 'data-gtab']) if (el.hasAttribute(a)) return `[${a}="${el.getAttribute(a)}"]`;
  return el.id ? '#' + el.id : null;
}
// 화면 낭독기에게만 들리는 알림 (채점 결과 등)
function announce(text) {
  const el = document.getElementById('srLive');
  if (!el || !text) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 30);
}
// 채점 결과 제목으로 초점을 옮기고 읽어 준다
function focusResult() {
  const h = $('#resBox h2');
  if (!h) return;
  h.tabIndex = -1; h.focus({ preventScroll: true });
  announce(h.textContent);
}
// 다음 문제로 넘어가면 문제 글로 초점을 옮기고 몇 번 문제인지 알려 준다
function focusQuestion() {
  const t = $('.q-text');
  if (!t || !session) return;
  t.tabIndex = -1; t.focus({ preventScroll: true });
  announce(`${session.i + 1}번 문제`);
}
function restoreFocus(sel) {
  if (!sel) return;
  // 서술형은 채점 뒤 '채점 안 하고 다음' 대신 채점 칸으로
  const after = $('#selfForm input') || $('#next');
  const el = $(sel) || ((sel === '#checkBtn' || sel === '#skipBtn') ? after : null);
  el?.focus({ preventScroll: true });
}
function drawQuestion() {
  const fsel = focusKey(document.activeElement);
  drawQuestion0();
  restoreFocus(fsel);
  render.keepScroll = false; // render() 를 거치지 않았으므로 다음 화면 이동에 남지 않게
}
function drawQuestion0() {
  tickSpent();
  const it = session.items[session.i];
  const { pack, q, key } = it;
  const pr = S.qp(key);
  const res = session.results[session.i];
  const ans = session.answers[session.i];
  const exam = session.mode === 'exam';
  const locked = !!res || (exam && session.submitted);

  // 지문 없이 (가)·(나)·㉠·윗글을 가리키는 문제는 자료의 원문을 옆에 펼쳐 준다
  const citeAll = !q.context && CITE_RE.test(q.question) ? SRC.textsOf(pack).filter(t => t.body) : [];
  const citeSrc = citeAll.length ? citeAll : null;
  const citeMissing = !q.context && !citeSrc && CITE_RE.test(q.question);
  let body = '';
  if (q.type === 'mcq') {
    const sel = Array.isArray(ans) ? ans : [];
    const right = Array.isArray(q.answer) ? q.answer : [q.answer];
    const multi = right.length > 1;
    body = `${multi ? '<p class="small muted">답이 여러 개다. 모두 고른다.</p>' : ''}<ul class="choices">${q.choices.map((c, i) => {
      const n = i + 1;
      let cls = sel.includes(n) ? 'sel' : '';
      if (res) cls = right.includes(n) ? 'right' : (sel.includes(n) ? 'wrong' : '');
      return `<li><button type="button" class="choice ${cls}" aria-pressed="${sel.includes(n)}" data-ch="${n}"${locked ? ' disabled' : ''}><span class="n">${'①②③④⑤⑥'[i] || n}</span><span>${esc(c)}</span></button></li>`;
    }).join('')}</ul>`;
  } else if (q.type === 'short') {
    body = `<input type="text" id="ansIn" aria-label="답" placeholder="답을 쓴다" value="${esc(ans || '')}"${locked ? ' disabled' : ''} autocomplete="off" style="margin-top:12px">`;
  } else {
    const max = D.essayMax(q);
    body = `<p class="small muted" style="margin-top:10px">${max}점${q.limit ? ' · ' + esc(q.limit) : ''}</p><textarea id="ansIn" aria-label="답안" placeholder="답안을 쓴다"${locked ? ' disabled' : ''} style="min-height:180px">${esc(ans || '')}</textarea>
    <p class="small muted" id="lenInfo"></p>`;
  }

  const timer = exam ? `<span class="timer" id="timer"></span>` : '';
  main.innerHTML = `
  <h1 class="vh">문제 풀이 ${session.i + 1}번</h1>
  <div class="row between"><span class="small muted">${session.i + 1} / ${session.items.length}${exam ? ' · 실전' : ''}</span>${timer}<button class="btn sm ghost" id="quit">그만</button></div>
  ${navButtons()}
  <section class="card qcard${q.context || citeSrc ? ' has-ctx' : ''}">
    <div class="q-head">${subjDot(pack.subject)}<span class="small">${subjName(pack.subject)} · ${esc(pack.title)}</span><span class="tag">${TYPE_NAME[q.type]}</span>${q.difficulty ? `<span class="tag" title="난이도">난이도 ${q.difficulty}</span>` : ''}${pr?.n ? `<span class="tag ${pr.last === 'ok' ? 'ok' : pr.last === 'part' ? 'warn' : 'bad'}">지금까지 ${pr.ok}/${pr.n} 맞음</span>` : ''}</div>
    <div class="q-split">
    ${q.context ? `<div class="q-ctx">${ctxHtml(q.context)}</div>` : citeSrc ? `<details class="q-ctx q-src"${S.load('qSrcOpen', true) ? ' open' : ''}><summary>원문 보기 · ${esc(citeSrc.map(t => t.title).join(', '))}</summary>${citeSrc.map(t => `<div class="src-text">${t.body.split('\n').map(l => l.trim() ? `<div class="l">${srcLine(l)}</div>` : '<div class="l e"></div>').join('')}</div>`).join('<hr>')}</details>` : ''}
    <div class="q-main">
    ${citeMissing && !res ? `<p class="note warnbar small">이 문제는 지문을 가리키는데 이 자료에 원문이 없다. <a href="#/pack?id=${encodeURIComponent(pack.id)}&srcedit=1">원문 넣으러 가기</a> 또는 <button type="button" class="btn sm" id="noSrcSkip">건너뛰기 <kbd>S</kbd></button> <span class="muted">(오답에 안 넣는다)</span></p>` : ''}
    <div class="q-text">${qHtml(q.question)}</div>
    ${body}
    <div id="resBox">${res ? resultHtml(it, res) : ''}</div>
    <div class="row" style="margin-top:14px" id="actions"></div>
    ${q.type === 'mcq' && !res ? `<p class="small muted keyhint">키보드: 숫자 1~${(q.choices || []).length} 보기 · Q/W/E 확신도 · Enter 채점 · ? 단축키 전체</p>` : ''}
    </div></div>
  </section>
  <div class="row"><button type="button" class="chip${pr?.star ? ' on' : ''}" id="starBtn" aria-pressed="${!!pr?.star}">${pr?.star ? '헷갈림 표시됨' : '헷갈림 표시'}</button>${q.source ? `<span class="small muted">출처: ${esc(q.source)}</span>` : ''}</div>
  `;

  $('.q-src')?.addEventListener('toggle', e => S.save('qSrcOpen', e.target.open));
  $('#noSrcSkip')?.addEventListener('click', () => { session.skipped = session.skipped || {}; session.skipped[session.i] = true; if (session.i < session.items.length - 1) { session.i++; drawQuestion(); focusQuestion(); } else toSummary(); });
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
    const upd = () => { session.answers[session.i] = inp.value; const li = $('#lenInfo'); if (li) li.textContent = `${inp.value.replace(/\s/g, '').length}자 (공백 빼고)`; syncCheck(); };
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
    acts.innerHTML = `${q.type !== 'essay' ? `<div class="conf small" role="group" aria-label="확신도"><span class="muted">얼마나 확실해?</span>${[['sure', '확실'], ['unsure', '애매'], ['guess', '찍음']].map(([v, l]) => `<button type="button" class="chip${cf === v ? ' on' : ''}" aria-pressed="${cf === v}" data-conf="${v}">${l}</button>`).join('')}</div>` : ''}<button class="btn pri" id="checkBtn">채점</button><button class="btn ghost" id="skipBtn">모르겠다</button>`;
  } else {
    // 서술형을 아직 채점하지 않았으면 '다음'은 보조 버튼으로 (채점 칸의 버튼이 주 버튼)
    const pending = res.selfGrade && !res.result;
    acts.innerHTML = `${session.viewing ? `<a class="btn" href="#/run" id="toSum">결과 목록</a>` : ''}<button class="btn${pending ? '' : ' pri'}" id="next">${pending ? '채점 안 하고 ' : ''}${last ? '결과 보기' : '다음'}</button>`;
  }
  syncCheck();
  $$('[data-conf]').forEach(b => b.addEventListener('click', () => {
    session.conf = session.conf || {};
    session.conf[session.i] = session.conf[session.i] === b.dataset.conf ? '' : b.dataset.conf;
    render.keepScroll = true; drawQuestion();
  }));
  $('#prev')?.addEventListener('click', () => { session.i--; drawQuestion(); });
  $('#next')?.addEventListener('click', () => {
    if (session.viewing) {
      if (last) toSummary(); else { session.i++; drawQuestion(); focusQuestion(); }
      return;
    }
    session.i++; render(); focusQuestion();
  });
  $('#toSum')?.addEventListener('click', e => { e.preventDefault(); toSummary(); });
  $('#submitAll')?.addEventListener('click', submitExam);
  $('#checkBtn')?.addEventListener('click', async () => {
    const a = session.answers[session.i];
    if (a == null || a === '' || (Array.isArray(a) && !a.length)) return toast('답을 먼저 쓴다. 모르면 "모르겠다".');
    await gradeOne(session.i, $('#checkBtn'));
    render.keepScroll = true; drawQuestion();
    announce($('#resBox h2')?.textContent || '');
    if (!main.contains(document.activeElement)) ($('#selfForm input') || $('#next'))?.focus({ preventScroll: true });
  });
  $('#skipBtn')?.addEventListener('click', () => {
    tickSpent();
    const r = { result: 'wrong', skipped: true };
    session.results[session.i] = r;
    S.recordAnswer(key, 'wrong', '', null, session.spent[session.i], { skip: true, sess: session.id });
    render.keepScroll = true; drawQuestion();
    announce('모르는 문제로 넘김');
  });
  bindResult(session.i);
  if (exam && !session.submitted) tickTimer();
}

// (가)·(나)·㉠·윗글 처럼 지문을 가리키는 말
const CITE_RE = /\([가-하]\)|[㉠-㉭]|윗글|위 글|밑줄 친|이 시에|이 글에/;
// 문제 글에 표(| 칸 | 칸 |)가 있으면 정리 노트처럼 표로 그린다. 나머지는 쓴 그대로.
function qHtml(t) {
  const text = String(t || '');
  return /^\s*\|.+\|\s*$/m.test(text) && /^\s*\|?\s*:?-{3,}/m.test(text) ? `<div class="q-md">${md(text)}</div>` : esc(text);
}

// 답을 아직 안 골랐으면 채점 버튼을 잠근다 (모르면 "모르겠다")
function syncCheck() {
  const b = document.getElementById('checkBtn');
  if (!b || !session) return;
  const a = session.answers[session.i];
  b.disabled = a == null || (typeof a === 'string' ? !a.trim() : Array.isArray(a) && !a.length);
}

// ? 를 누르면 키보드 단축키 목록
document.addEventListener('keydown', e => {
  if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (['textarea', 'input', 'select'].includes((e.target.tagName || '').toLowerCase())) return;
  e.preventDefault();
  const d = document.createElement('dialog');
  d.className = 'dlg';
  d.setAttribute('aria-labelledby', 'kbdTitle');
  d.innerHTML = `<form method="dialog"><h2 id="kbdTitle" style="margin-top:0">키보드 단축키</h2>
    <table class="crit"><tr><td>문제 풀이</td><td>1~6 보기 고르기 · Q/W/E 확실·애매·찍음 · Enter 채점·다음 · D 모르겠다 · S 원문 없는 문제 건너뛰기</td></tr>
    <tr><td>실전 모드</td><td>← → 이전·다음 문제</td></tr>
    <tr><td>암기카드</td><td>스페이스 뒤집기 · 1 몰랐다 · 2 알았다</td></tr>
    <tr><td>채점 방법 탭</td><td>← → 탭 옮기기</td></tr>
    <tr><td>메뉴·형광펜 띠</td><td>Esc 닫기</td></tr></table>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn pri">닫기</button></div></form>`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
});

// 태블릿 키보드용: 숫자로 보기 고르기, Enter 로 채점·다음
document.addEventListener('keydown', e => {
  if (params().path !== '/run' || !session || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (['textarea', 'input', 'select'].includes(tag)) return;
  // 버튼에 초점이 있을 때 Enter 는 그 버튼이 받는다 (두 번 누르는 것을 막는다)
  if (e.key === 'Enter' && ['button', 'a', 'summary'].includes(tag)) return;
  const conf = { q: 'sure', w: 'unsure', e: 'guess' }[e.key.toLowerCase()];
  if (/^[1-6]$/.test(e.key)) { const b = main.querySelector(`[data-ch="${e.key}"]:not([disabled])`); if (b) { e.preventDefault(); b.click(); } }
  else if (conf) { const b = main.querySelector(`[data-conf="${conf}"]`); if (b) { e.preventDefault(); b.click(); } }
  else if (e.key.toLowerCase() === 's' && $('#noSrcSkip')) { e.preventDefault(); $('#noSrcSkip').click(); }
  else if (e.key.toLowerCase() === 'd' && $('#skipBtn')) { e.preventDefault(); $('#skipBtn').click(); }
  else if (e.key === 'Enter') {
    const b = $('#checkBtn') || $('#next');
    if (b && b.disabled) { e.preventDefault(); toast('답을 먼저 고른다. 모르면 "모르겠다" (D).'); }
    else if (b) { e.preventDefault(); b.click(); }
  }
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
// 빈칸이 여럿인 답 ("이승만, 이시영") 은 순서를 바꿔 써도 맞다
const partsKey = s => String(s || '').split(/\s*[,，、]\s*/).map(norm).filter(Boolean).sort().join('|');
const shortOk = (answers, a) => answers.some(x => norm(x) === norm(a) || (/[,，、]/.test(x) && partsKey(x) === partsKey(a)));

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
    else if (shortOk(q.answers, a)) r = { result: 'ok' };
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
  // 서술형은 0점이 아니면 '틀렸다' 대신 부분 점수로 부른다 (오답노트에는 그대로 들어간다)
  const essayPart = q.type === 'essay' && r.result === 'wrong' && r.fb?.score > 0;
  const title = r.guessed ? '맞았지만 찍었다' : essayPart ? `부분 점수 ${r.fb.score}/${r.fb.max}` : ({ ok: '맞았다', part: '부분 점수', wrong: r.skipped ? '모르는 문제로 넘김' : '틀렸다' }[r.result] || '채점하기');
  let h = `<div class="result ${essayPart ? 'part' : r.result || ''}"><h2 class="h3">${title}</h2>`;
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
      <div class="gtabs" role="tablist" aria-label="채점 방법"><button type="button" role="tab" class="gtab" id="gt-self" aria-controls="gp-self" aria-selected="true" data-gtab="self">내가 채점</button><button type="button" role="tab" class="gtab" id="gt-chat" aria-controls="gp-chat" aria-selected="false" tabindex="-1" data-gtab="chat">Claude 채팅 채점 (무료)</button></div>
      <div class="gpanel" data-gpanel="self" id="gp-self" aria-labelledby="gt-self" role="tabpanel"><p class="small" style="margin-top:0">모범 답안을 보고 맞힌 기준을 고른다.</p>
      <form id="selfForm">${q.rubric.map((c, i) => `<label class="item" style="display:flex;gap:8px;padding:6px 0"><input type="checkbox" name="c" value="${i}"><span class="grow">${esc(c.criterion)}</span><span class="num small">${c.points}점</span></label>`).join('')}
      <div class="row" style="margin-top:6px"><button class="btn sm pri">이만큼 맞혔다</button>${AI.hasKey() ? '<button type="button" class="btn sm" id="retryAi">AI 채점 다시</button>' : ''}</div></form></div>
      <div class="gpanel chatgrade" data-gpanel="chat" id="gp-chat" aria-labelledby="gt-chat" role="tabpanel" hidden>${chatBox('채점 요청 복사')}</div>`;
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

// 서술형 채점 방법 탭
document.addEventListener('click', e => {
  const b = e.target.closest('[data-gtab]');
  if (!b) return;
  const box = b.closest('.result') || b.parentElement.parentElement;
  pickGtab(box, b);
});
function pickGtab(box, b) {
  box.querySelectorAll('[data-gtab]').forEach(x => { x.setAttribute('aria-selected', String(x === b)); x.tabIndex = x === b ? 0 : -1; });
  box.querySelectorAll('[data-gpanel]').forEach(p => { p.hidden = p.dataset.gpanel !== b.dataset.gtab; });
}
// 탭 사이는 ← → 로 옮긴다
document.addEventListener('keydown', e => {
  const b = e.target.closest?.('[data-gtab]');
  if (!b || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const tabs = [...b.parentElement.querySelectorAll('[data-gtab]')];
  const i = tabs.indexOf(b);
  const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  pickGtab(b.closest('.result') || b.parentElement.parentElement, tabs[n]);
  tabs[n].focus();
});

// API 키 없이 claude.ai 채팅으로 채점: 요청 복사 → 채팅에 붙여넣기 → 답 붙여넣기
function chatBox(copyLabel) {
  return `<ol class="small" style="padding-left:1.2em;margin:6px 0">
    <li><button type="button" class="btn sm" data-cg-copy>${copyLabel}</button> <a class="btn sm ghost" href="https://claude.ai/new" target="_blank" rel="noopener">claude.ai 열기</a><br><span class="muted">claude.ai 무료 계정이나 그 과목 공부 Claude 채팅 어디든 된다.</span></li>
    <li>Claude 채팅에 붙여넣고 보낸다.</li>
    <li>Claude 가 준 코드 블록을 복사해서 아래에 붙여넣는다.</li>
  </ol>
  <pre class="prompt" data-cg-text hidden></pre>
  <textarea data-cg-in placeholder='Claude 의 답을 여기에 붙여넣기 ({"criteria": ... } 또는 {"verdict": ... })' style="min-height:80px;font-size:.85rem"></textarea>
  <button type="button" class="btn sm" data-cg-apply style="margin-top:6px">채점 결과 넣기</button>`;
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
    render.keepScroll = true; drawQuestion(); focusResult();
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
    render.keepScroll = true; drawQuestion(); focusResult();
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
      render.keepScroll = true; drawQuestion(); focusResult();
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
  const skipped = session.skipped || {};
  const nSkip = items.filter((_, i) => skipped[i] && !res[i]).length;
  const essayIdx = items.map((it, i) => i).filter(i => items[i].q.type === 'essay' && res[i]?.fb);
  const eScore = essayIdx.reduce((s, i) => s + res[i].fb.score, 0);
  const eMax = essayIdx.reduce((s, i) => s + res[i].fb.max, 0);
  const self = items.filter((_, i) => res[i]?.selfGrade && !res[i].result).length;
  const objIdx = items.map((it, i) => i).filter(i => items[i].q.type !== 'essay');
  const objOk = objIdx.filter(i => res[i]?.result === 'ok').length;
  let bookMsg = '';
  if (session.bookPack) {
    const bp = D.db().byId[session.bookPack];
    const n = items.length, ok = count('ok');
    if (items.every((_, i) => res[i]?.result) && !session.bookSaved) { S.kvSet('bookdone', session.bookPack, { ok, n, t: Date.now() }); session.bookSaved = true; }
    bookMsg = `<section class="card book-gate"><h2>책 문제 끝</h2><p>${n}개 중 ${ok}개 맞혔다. 틀린 문제는 오답노트에 들어갔다. 이제 공부자료를 보면서 틀린 이유를 찾는다.</p><a class="btn pri" href="#/pack?id=${encodeURIComponent(session.bookPack)}">${esc(bp?.title || '')} 공부자료 보기</a></section>`;
  }
  main.innerHTML = `
  <h1>결과</h1>
  ${bookMsg}
  <p class="result-line"><b>${items.length - nSkip}문제 중 ${count('ok')}개 맞음</b>${nSkip ? ` · 원문 없어서 건너뜀 ${nSkip}` : ''}${count('part') ? ` · 부분 점수 ${count('part')}` : ''}${count('wrong') ? ` · 틀림 ${count('wrong')}` : ''}${eMax ? ` · 서술형 ${eScore}/${eMax}점` : ''}${session.usedMs ? ` · ${Math.round(session.usedMs / 60000)}분` : ''}</p>
  <p class="small muted" style="margin-top:-4px">${count('wrong') + count('part') ? `틀리거나 부분 점수인 ${count('wrong') + count('part')}문제는 오답노트에 넣었다. ` : '다 맞혔다. '}오늘 푼 문제는 모두 ${(S.getLog()[S.today()] || {}).q || 0}개다.</p>
  <div class="row" style="margin:12px 0 16px">
    ${count('wrong') + count('part') ? '<button class="btn pri" id="retryWrong">틀린 것만 다시</button>' : ''}
    <a class="btn" href="#/quiz">다른 문제</a>
    <a class="btn ghost" href="#/">홈</a>
  </div>
  ${self ? `<p class="note">스스로 채점할 서술형이 ${self}개 남았다. 눌러서 채점한다.</p>` : ''}
  <section class="card flat"><ul class="list">${items.map((it, i) => {
    const r = res[i];
    const tag = r?.result === 'ok' ? '<span class="tag ok">맞음</span>' : r?.result === 'part' ? '<span class="tag warn">부분</span>' : r?.result === 'wrong' ? '<span class="tag bad">틀림</span>' : r?.selfGrade ? '<span class="tag vio">채점 필요</span>' : skipped[i] ? '<span class="tag">건너뜀</span>' : '<span class="tag">안 풂</span>';
    return `<li><a class="item" href="#" data-open="${i}"><span class="mono small" style="width:2em">${i + 1}</span><span class="grow">${esc(it.q.question.slice(0, 70))}${it.q.question.length > 70 ? '…' : ''}<br><span class="small muted">${subjName(it.pack.subject)} · ${TYPE_NAME[it.q.type]}${r?.fb?.max ? ` · ${r.fb.score}/${r.fb.max}점` : ''}</span></span>${tag}</a>${r?.result === 'wrong' || r?.result === 'part' ? causeSelect(it.key, i + 1) : ''}</li>`;
  }).join('')}</ul></section>`;
  scrollTo(0, 0);
  const h = $('h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  announce($('.result-line')?.textContent || '');
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
  ${wrongItems().length ? `<div class="chips" style="margin-top:6px"><span class="small muted" style="align-self:center">원인</span>${(() => {
    // 원인 칩은 해당 문제가 있는 것만, 개수를 붙여서
    const all = wrongItems().filter(x => !sel || x.pack.subject === sel);
    const n = v => v === '' ? all.length : all.filter(x => (causeOf(x.key) || 'none') === v).length;
    return [['', '전체'], ...CAUSES, ['none', '안 적음']].filter(([v]) => v === '' || v === cz || n(v)).map(([v, l]) => `<a class="chip${cz === v ? ' on' : ''}" href="#/wrong?${new URLSearchParams({ ...(sel ? { s: sel } : {}), ...(v ? { c: v } : {}) })}">${l} <span class="muted">${n(v)}</span></a>`).join('');
  })()}</div>` : ''}
  <div class="stack" style="margin-top:12px">${items.map(x => {
    const r = prog[x.key];
    const qq = x.q;
    let right = '';
    if (qq.type === 'mcq') right = (Array.isArray(qq.answer) ? qq.answer : [qq.answer]).map(n => `${'①②③④⑤⑥'[n - 1]} ${esc(qq.choices[n - 1])}`).join('<br>');
    if (qq.type === 'short') right = qq.answers.map(esc).join(' / ');
    if (qq.type === 'essay') right = esc(qq.model_answer);
    let mine = r.ans;
    if (qq.type === 'mcq' && Array.isArray(mine)) mine = mine.map(n => `${'①②③④⑤⑥'[n - 1]} ${qq.choices[n - 1] || ''}`).join('\n');
    return `<details class="card flat"><summary style="color:var(--ink)"><span class="q-head" style="display:inline-flex;margin:0">${subjDot(x.pack.subject)}<span class="tag">${TYPE_NAME[qq.type]}</span><span class="tag bad">${r.ok}/${r.n}</span>${r.star ? '<span class="tag warn">헷갈림</span>' : ''}<span class="small muted">${esc(x.pack.title)}</span></span><br>${esc(qq.question)}</summary>
      ${qq.context ? `<div class="q-ctx">${ctxHtml(qq.context)}</div>` : ''}
      ${qq.type === 'mcq' ? `<ul class="small plain">${qq.choices.map((c, i) => `<li>${'①②③④⑤⑥'[i] || i + 1} ${esc(c)}</li>`).join('')}</ul>` : ''}
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
}

// 오답 원인 칩 (오답노트, 결과 화면 공통)
document.addEventListener('click', e => {
  const b = e.target.closest('[data-cause]');
  if (!b) return;
  const k = b.dataset.ck;
  if (causeOf(k) === b.dataset.cause) S.kvDel('wcause', k); else S.kvSet('wcause', k, { cause: b.dataset.cause });
  b.closest('.chips').querySelectorAll('[data-cause]').forEach(x => { const on = x === b && causeOf(k) === b.dataset.cause; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
});
// 결과 화면은 칩 다섯 개 대신 고르기 하나로 (줄마다 버튼이 늘어서지 않게)
const causeSelect = (key, n) => `<label class="cause-row small"><span class="muted">왜 틀렸나</span><select data-cause-sel="${esc(key)}"${n ? ` aria-label="${n}번 왜 틀렸나"` : ''}><option value="">고르기</option>${CAUSES.map(([v, l]) => `<option value="${v}"${causeOf(key) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
document.addEventListener('change', e => {
  const sel = e.target.closest?.('[data-cause-sel]');
  if (!sel) return;
  if (sel.value) S.kvSet('wcause', sel.dataset.causeSel, { cause: sel.value }); else S.kvDel('wcause', sel.dataset.causeSel);
});

// ================= 암기카드 =================
let flash = null;
function viewCardsSetup() {
  const all = D.allCards();
  if (!all.length) { main.innerHTML = '<h1>암기카드</h1><p class="muted">카드가 들어 있는 자료가 없다.</p>'; return; }
  const last = { n: '30', ...S.load('cardPrefs', { subject: [], packs: [], src: 'due', flip: 'front' }) };
  const packs = D.db().packs.filter(p => (p.cards || []).length);
  main.innerHTML = `<div class="narrow"><h1>암기카드</h1>
  <form id="cf" class="card">
    <h2 class="h3">과목</h2>${chipGroup('subject', SUBJECTS.filter(s => packs.some(p => p.subject === s.id)).map(s => ({ value: s.id, label: s.name, dot: true })), last.subject)}
    <div id="cpacks"></div>
    <h2 class="h3" style="margin-top:14px">어떤 카드</h2>${chipGroup('src', [{ value: 'due', label: '외울 때 된 카드 + 새 카드' }, { value: 'all', label: '전부' }, { value: 'miss', label: '모른다고 한 카드' }], [last.src], false)}
    <h2 class="h3" style="margin-top:14px">먼저 볼 면</h2>${chipGroup('flip', [{ value: 'front', label: '앞면 (문제)' }, { value: 'back', label: '뒷면 (답)' }], [last.flip], false)}
    <h2 class="h3" style="margin-top:14px">한 번에</h2>${chipGroup('n', [{ value: '20', label: '20장' }, { value: '30', label: '30장' }, { value: '50', label: '50장' }, { value: 'all', label: '전부' }], [String(last.n)], false)}
    <p class="small muted" id="ccount"></p>
    <button class="btn pri block">시작</button>
  </form></div>`;
  const draw = () => {
    const subs = picked('subject');
    // 단원 칩이 수십 개라 과목을 고른 뒤에만 과목별로 묶어 보여 준다
    $('#cpacks').innerHTML = subs.length ? '<h2 class="h3" style="margin-top:14px">단원</h2>' + SUBJECTS.filter(x => subs.includes(x.id)).map(x => `${subs.length > 1 ? `<p class="small muted" style="margin:8px 0 4px">${subjDot(x.id)} ${x.name}</p>` : ''}${chipGroup('packs', packs.filter(p => p.subject === x.id).map(p => ({ value: p.id, label: p.title })), last.packs)}`).join('')
      : '<p class="small muted" style="margin:10px 0 0">과목을 고르면 단원도 고를 수 있다.</p>';
    $$('input[name="packs"]').forEach(i => i.addEventListener('change', cnt));
    cnt();
  };
  const collect = () => ({ subject: picked('subject'), packs: picked('packs'), src: picked('src')[0], flip: picked('flip')[0], n: picked('n')[0] || '30' });
  const cnt = () => { const c = collect(), k = pickCards(c).length; $('#ccount').textContent = `고른 조건에 맞는 카드 ${k}장${c.n !== 'all' && k > Number(c.n) ? ` 중 ${c.n}장을 섞어서 본다` : ''}`; };
  $$('input[name="subject"]').forEach(i => i.addEventListener('change', draw));
  $$('input[name="src"], input[name="n"]').forEach(i => i.addEventListener('change', cnt));
  draw();
  $('#cf').addEventListener('submit', e => {
    e.preventDefault();
    const c = collect();
    S.save('cardPrefs', c);
    let list = shuffle(pickCards(c));
    if (c.n !== 'all') list = list.slice(0, Number(c.n));
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
  <div class="row between"><span class="small muted">남은 카드 ${flash.list.length - flash.i}장 · ${subjName(x.pack.subject)} · ${esc(x.pack.title)}</span><a class="btn sm ghost" href="#/cards">그만</a></div>
  <div class="bar" style="margin:8px 0 14px"><i style="width:${pct(flash.i, flash.list.length)}%"></i></div>
  <h1 class="vh">암기카드</h1>
  <section class="card flash ${showBack ? 'back' : ''}" id="fc" role="button" tabindex="0">
    <span class="side" id="fcHint">${showBack ? '뒷면' : '앞면'} · 눌러서 뒤집기 (스페이스)</span>
    <div>${esc(showBack ? x.c.back : x.c.front)}</div>
    ${showBack && x.c.note ? `<p class="small muted" style="margin-top:10px">${esc(x.c.note)}</p>` : ''}
  </section>
  ${flash.back ? `<div class="row flash-acts"><button class="btn bad" id="no">몰랐다 <kbd>1</kbd></button><button class="btn ok" id="yes">알았다 <kbd>2</kbd></button></div>` : '<p class="small muted" style="text-align:center">떠올려 본 다음 뒤집는다.</p>'}`;
  if (!flash.shownAt || flash.shownFor !== flash.i) { flash.shownAt = Date.now(); flash.shownFor = flash.i; }
  const flip = () => { flash.back = !flash.back; viewFlash(); };
  $('#fc').addEventListener('click', flip);
  $('#fc').addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
  const next = knew => { S.recordCard(x.key, knew, Date.now() - flash.shownAt); flash.shownAt = 0; if (knew) flash.knew++; else flash.list.push(x); flash.i++; flash.back = false; viewFlash(); };
  $('#yes')?.addEventListener('click', () => next(true));
  $('#no')?.addEventListener('click', () => next(false));
  flash.next = next;
  // 다시 그린 뒤에도 키보드로 이어서 넘길 수 있게 카드에 초점을 둔다
  $('#fc').focus({ preventScroll: true });
}
// 카드: 1 = 몰랐다, 2 = 알았다 (뒤집은 뒤에만)
document.addEventListener('keydown', e => {
  if (params().path !== '/flash' || !flash || !flash.back || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (['input', 'textarea', 'select'].includes((e.target.tagName || '').toLowerCase())) return;
  if (e.key === '1') { e.preventDefault(); flash.next?.(false); }
  if (e.key === '2') { e.preventDefault(); flash.next?.(true); }
});

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
    <h2 class="h3">유형</h2>${chipGroup('types', Object.entries(TYPE_NAME).map(([v, l]) => ({ value: v, label: l })), ['mcq', 'short', 'essay'])}
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
      ${x.context ? `<div class="q-ctx">${ctxHtml(x.context)}</div>` : ''}
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
  // 지금 주가 없으면(주 사이 빈 날) 다음 주를 펼친다
  const openWeek = np && np.weeks ? (np.weeks.find(w => w.start <= t && t <= w.end) || np.weeks.find(w => w.start > t) || null) : null;
  const weeksHtml = np && np.weeks ? np.weeks.filter(w => w.end >= t || w === openWeek).map(w => {
    const items = w.groups.flatMap(g => g.items.map(i => byId[i.id]).filter(Boolean));
    const done = items.filter(i => i.done).length;
    const isCur = w === openWeek;
    return `<details class="card flat week${isCur ? ' cur' : ''}"${isCur ? ' open' : ''}>
      <summary><b>${esc(w.title)}</b> ${w.stage ? `<span class="tag vio">${esc(w.stage)}</span>` : ''}${isCur ? ` <span class="tag ok">${w.start > t ? '다음 주' : '이번 주'}</span>` : ''}${w.overlap ? ` <span class="tag warn">${esc(w.overlap)}</span>` : ''} <span class="small muted">${done}/${items.length}</span>
        <div class="bar" style="margin-top:6px"><i style="width:${pct(done, items.length)}%"></i></div></summary>
      ${w.note ? `<p class="small muted" style="white-space:pre-wrap">${esc(w.note)}</p>` : ''}
      ${w.groups.map(g => {
        const gi = g.items.map(i => byId[i.id]).filter(Boolean);
        if (!gi.length) return '';
        const self = g.items.length === 1 && g.items[0].self;
        return `<div class="wgroup">${self ? '' : `<div class="wg-h">${g.subject ? subjDot(g.subject) : g.label ? `<span class="tag">${esc(g.label)}</span>` : ''} <b>${esc(g.title)}</b></div>`}
          <ul class="list">${gi.map(p => `<li class="item" style="align-items:flex-start"><label class="plan-row"><input type="checkbox" data-pc="${p.id}"${p.done ? ' checked' : ''}><span class="pdate mono small${p.date === t ? ' today' : ''}">${p.date ? Number(p.date.slice(5, 7)) + '/' + Number(p.date.slice(8)) : '이번 주'}${p.date && p.date < t && !p.done ? '<br><span class="tag warn">밀림</span>' : ''}</span><span class="grow"${p.done ? ' style="text-decoration:line-through;color:var(--ink3)"' : ''}>${self && p.subject ? subjDot(p.subject) + ' ' : ''}${esc(planText(p.text))}</span></label>${planGo(p)}</li>`).join('')}</ul></div>`;
      }).join('')}
      ${w.url ? `<p class="small"><a href="${esc(w.url)}" target="_blank" rel="noopener">Notion 에서 보기</a></p>` : ''}
    </details>`;
  }).join('') : '';
  const nst = NT.status();
  const notionHtml = nst ? (() => {
    const sm = NT.scopeSummary(nst.scope);
    const ck = v => v ? '<span style="color:var(--ok)">●</span>' : '<span class="muted">○</span>';
    const bySub = {};
    for (const r of nst.scope) (bySub[r.subject || '기타'] = bySub[r.subject || '기타'] || []).push(r);
    return `<div class="sec-title"><h2>시험 범위 현황</h2><span class="small muted">Notion Exam Scope · ${esc(String(nst.generated || '').replace('T', ' ').slice(0, 16))} 업데이트</span></div>
    <section class="card flat">
      <p class="small">회독 칸 <b>${sm.done}/${sm.cells}</b> (${sm.pct}%) · 과목을 누르면 범위가 펼쳐진다</p><div class="bar" style="margin:4px 0 6px"><i style="width:${sm.pct}%"></i></div>
      ${Object.entries(bySub).map(([sub, rows]) => { const d = rows.reduce((a, r) => a + (r.r1 ? 1 : 0) + (r.r2 ? 1 : 0) + (r.r3 ? 1 : 0), 0); return `<details class="scope-sub"><summary><span class="grow"><b>${esc(sub)}</b> <span class="small muted">범위 ${rows.length}개</span></span><span class="mini-bar"><i style="width:${pct(d, rows.length * 3)}%"></i></span><span class="small mono muted">${d}/${rows.length * 3}</span></summary>
        <div style="overflow-x:auto"><table class="crit scope-t"><tr><td class="small muted">범위</td><td class="pt small muted">1회독</td><td class="pt small muted">2회독</td><td class="pt small muted">3회독</td><td class="pt small muted">문제</td><td class="small muted">메모</td></tr>
        ${rows.map(r => `<tr><td>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.range)}</a>` : esc(r.range)}</td><td class="pt">${ck(r.r1)}</td><td class="pt">${ck(r.r2)}</td><td class="pt">${ck(r.r3)}</td><td class="pt">${ck(r.solve)}</td><td class="small">${esc(r.memo || '')}</td></tr>`).join('')}
        </table></div></details>`; }).join('')}
    </section>
    ${nst.exam_md ? `<details class="card flat fold"><summary><b>Notion Exam 메모</b> <span class="small muted">하루 공부 시간, 회독 흐름</span></summary><div class="notes">${md(nst.exam_md)}</div></details>` : ''}`;
  })() : '';
  main.innerHTML = `
  <h1>시험 일정과 계획</h1>
  ${weeksHtml ? `<div class="sec-title"><h2>주간 공부 계획</h2><span class="small muted">Notion · 6시간마다 업데이트 · 사이트에서 체크한 것은 그대로</span></div>${weeksHtml}` : `<p class="note info">${NT.getKey() ? 'Notion 주간 계획을 기다리는 중이다. 6시간마다 들어온다.' : 'Notion 주간 계획과 시험 범위 현황이 6시간마다 저절로 들어오게 하려면 <a href="#/settings?go=notionSync">설정 → Notion 자동 업데이트</a> 에 비밀번호를 한 번 넣는다.'}</p>`}
  ${notionHtml}
  <details class="card fold">
    <summary><b>과목별 시험 날짜·범위 고치기</b> <span class="small muted">${SUBJECTS.filter(s => ex.subjects[s.id]?.date).length}/${SUBJECTS.length}과목 날짜 정함</span></summary>
    <p class="small muted">아직 정해지지 않았으면 "미정". 여기서 고친 값은 이 기기에만 저장된다. 저장소의 data/exam.json 이 바뀌면 그 값이 기본값이 된다.</p>
    <form id="ef">${SUBJECTS.map(s => {
      const v = ex.subjects[s.id] || {};
      return `<div style="padding:10px 0;border-top:1px solid var(--rule)">
        <div class="row between"><b>${subjDot(s.id)} ${s.name}</b>
        <select name="d_${s.id}" style="width:auto" aria-label="${s.name} 시험 날짜">${['', ...ex.days].map(d => `<option value="${d}"${(v.date || '') === d ? ' selected' : ''}>${d ? S.fmtDate(d) : '미정'}</option>`).join('')}</select></div>
        <textarea name="r_${s.id}" rows="2" style="min-height:52px;margin-top:6px" placeholder="시험 범위" aria-label="${s.name} 시험 범위">${esc(v.range || '')}</textarea>
      </div>`;
    }).join('')}
    <div class="row"><button class="btn pri">저장</button><button type="button" class="btn ghost" id="resetExam">저장소 값으로 되돌리기</button></div></form>
  </details>


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
      <ul class="list">${list.map(p => `<li class="item"><label class="plan-row"><input type="checkbox" data-pc="${p.id}"${p.done ? ' checked' : ''}><span class="grow"${p.done ? ' style="text-decoration:line-through;color:var(--ink3)"' : ''}>${p.subject ? subjDot(p.subject) + ' ' : ''}${esc(p.text)}</span></label><button class="btn sm ghost" data-pd="${p.id}" aria-label="지우기">✕</button></li>`).join('')}</ul>`).join('') : '<p class="muted small">계획이 없다.</p>'}
    ${plan.some(p => p.done) ? '<button class="btn sm ghost" id="clearDone" style="margin-top:10px">끝낸 계획 지우기</button>' : ''}
   </section>
  ${weeksHtml ? '<p class="small muted" style="margin-top:28px">Notion 에서 받은 주간 계획을 이 기기에서 지우려면 <button class="btn sm ghost bad" id="planDel">주간 계획 지우기</button></p>' : ''}`;
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
  const first = evs.length ? S.dayOf(evs[0].t) : S.today();
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
  for (const e of S.subjectTimeEvents()) out[e.sub] = (out[e.sub] || 0) + e.s;
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
  <p class="result-line" style="margin:12px 0 14px">지금까지 <b>${S.fmtDur(last.cs)}</b> 공부했다 · 문제 <b>${total.q}</b>개 (정답률 ${pct(total.ok, total.q)}%) · 공부한 날 <b>${studiedDays}</b>일${streakDays() ? ` · ${streakDays()}일째 이어서` : ''} · 형광펜·메모 ${Object.keys(S.kvAll('hl')).length}개</p>

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
    <h2>과목별</h2>
    <table class="crit"><tr><td class="small muted">과목</td><td class="pt small muted">공부 시간</td><td class="pt small muted">푼 문제</td><td class="pt small muted">정답률</td></tr>
    ${SUBJECTS.map(s => { const o = st[s.id]; return `<tr><td>${subjDot(s.id)} ${s.name}</td><td class="pt">${S.fmtDur(stime[s.id] || 0)}</td><td class="pt">${o.tried}/${o.total}</td><td class="pt">${o.n ? pct(o.ok, o.n) + '%' : '-'}</td></tr>`; }).join('')}
    <tr><td>${subjDot('math')} <a href="#/math">수학</a></td><td class="pt">${S.fmtDur(stime.math || 0)}</td><td class="pt">-</td><td class="pt">-</td></tr></table>
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
    ${(() => {
      // 이룬 것과 다음 3개만 펼치고 나머지는 접는다
      const row = m => `<li class="item"><span class="ms-ic ${m.date ? 'on' : ''}">${m.date ? '✓' : ''}</span><span class="grow">${m.label}</span><span class="small muted">${m.date ? (m.date === '달성' ? '달성' : S.fmtDate(m.date)) : '아직'}</span></li>`;
      const got = ms.filter(m => m.date), next = ms.filter(m => !m.date);
      return `<ul class="list ms">${[...got, ...next.slice(0, 3)].map(row).join('')}</ul>${next.length > 3 ? `<details class="fold"><summary class="small">아직 못 한 기록 ${next.length - 3}개 더</summary><ul class="list ms">${next.slice(3).map(row).join('')}</ul></details>` : ''}`;
    })()}
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
}
function startTimerLoop() {
  clearInterval(startTimerLoop._t);
  syncClockPill();
  const tick = () => {
    const t = S.load('timer', null);
    if (!t) return clearInterval(startTimerLoop._t);
    const left = t.start + t.len * 60000 - Date.now();
    const el = document.getElementById('ft');
    if (left <= 0) {
      S.remove('timer');
      S.recordFocus(t.len);
      clearInterval(startTimerLoop._t);
      syncClockPill();
      toast(`${t.len}분 집중 끝. 5분 쉬자.`, 5000);
      try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
      if (params().path === '/math') { render.keepScroll = true; render(); }
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
  const evs = S.getEvents().filter(e => S.dayOf(e.t) === d);
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
    if (e.k === 'o' || e.k === 'f' || e.k === 'sx') continue;
    if (e.k === 's' && !S.subjectTimeEvents(e.sub).some(x => x.id === e.id)) continue;
    // 같은 자료를 30분 안에 이어서 읽은 기록은 한 줄로 합친다
    if (e.k === 'r') {
      if (run && run.kind === 'read' && run.pack === e.pack && e.t - run.end < 30 * 60000) { run.s += e.s || 0; run.end = e.t; continue; }
      flushRun();
      run = { kind: 'read', t: e.t, end: e.t, pack: e.pack, s: e.s || 0 };
      continue;
    }
    flushRun();
    out.push({ kind: e.k, t: e.t, e });
  }
  flushRun();
  // 형광펜·메모, 끝낸 계획
  const marks = Object.values(S.kvAll('hl')).filter(h => S.dayOf(h.c) === d);
  const byPack = {};
  for (const h of marks) (byPack[h.pack] = byPack[h.pack] || []).push(h);
  for (const pk in byPack) out.push({ kind: 'hl', t: Math.min(...byPack[pk].map(h => h.c)), pack: pk, list: byPack[pk] });
  for (const p of planList()) if (p.done && p.doneAt && S.dayOf(p.doneAt) === d) out.push({ kind: 'plan', t: p.doneAt, p });
  const notes = Object.values(S.kvAll('pnote')).filter(n => S.dayOf(n.u) === d);
  for (const n of notes) out.push({ kind: 'pnote', t: n.u, n });
  for (const b of Object.values(S.kvAll('blank')).filter(b => S.dayOf(b.t) === d)) out.push({ kind: 'blank', t: b.t, b });
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
      const q = pk ? [...(pk.questions || []), ...(pk.book || [])].find(z => D.qkey(pk, z) === e.key) : null;
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
  if (x.kind === 'read') return x.s < 30 ? '' : `<li class="j-row">${time}<div class="grow">${packName(x.pack)} ${S.fmtDur(x.s)} 읽음</div></li>`;
  if (x.kind === 'r') return `<li class="j-row">${time}<div class="grow">${packName(e.pack)} ${S.fmtDur(e.s)} 읽음</div></li>`;
  if (x.kind === 's') return `<li class="j-row">${time}<div class="grow">${subjDot(e.sub)} ${subjName(e.sub)} ${S.fmtDur(e.s)} (${S.fmtTime(e.from)}~${S.fmtTime(e.t)})</div></li>`;
  if (x.kind === 'm') return `<li class="j-row">${time}<div class="grow">집중 타이머 ${e.min}분</div></li>`;
  if (x.kind === 'x') return `<li class="j-row">${time}<div class="grow"><span class="tag vio">실전</span> ${e.n}문제 · ${e.ok} 맞음${e.mx ? ` · 서술형 ${e.sc}/${e.mx}점` : ''} · ${e.min}분 · ${(e.subj || []).map(subjName).join(', ')}</div></li>`;
  if (x.kind === 'q') return `<li class="j-row">${time}<div class="grow">${packName(e.pack)} 에 질문: <span class="muted">${esc(e.text)}</span></div></li>`;
  if (x.kind === 'g') return `<li class="j-row">${time}<div class="grow">AI 문제 ${e.n}개 만듦 · ${packName(e.pack)}</div></li>`;
  if (x.kind === 'hl') return `<li class="j-row">${time}<div class="grow">${packName(x.pack)} 형광펜·메모 ${x.list.length}개<ul class="small" style="margin:4px 0 0;padding-left:1.1em">${x.list.slice(0, 5).map(h => `<li><span class="hl-sw hl-${h.color}"></span> <a href="#/pack?id=${encodeURIComponent(h.pack)}${h.where ? `&src=${encodeURIComponent(h.where.slice(4))}` : ""}&mark=${h.id}">${esc(h.text.slice(0, 50))}</a>${h.note ? ` <span class="muted">메모: ${esc(h.note.slice(0, 60))}</span>` : ''}</li>`).join('')}</ul></div></li>`;
  if (x.kind === 'plan') return `<li class="j-row">${time}<div class="grow">계획 끝냄: ${x.p.subject ? subjDot(x.p.subject) + ' ' : ''}${esc(x.p.text)}</div></li>`;
  if (x.kind === 'blank') return `<li class="j-row">${time}<div class="grow">백지 복습 ${packName(x.b.pack)} · 핵심어 <b>${x.b.cov}%</b> 떠올림${x.b.miss?.length ? `<br><span class="small muted">빠진 것: ${esc(x.b.miss.slice(0, 8).join(', '))}</span>` : ''}</div></li>`;
  if (x.kind === 'pnote') return `<li class="j-row">${time}<div class="grow">${packName(x.n.pack)} 단원 메모 고침</div></li>`;
  return '';
}

function viewJournal() {
  const { q } = params();
  const log = S.getLog();
  const one = q.get('d');
  const evDays = new Set(S.getEvents().map(e => S.dayOf(e.t)));
  for (const h of Object.values(S.kvAll('hl'))) evDays.add(S.dayOf(h.c));
  for (const id in S.kvAll('diary')) evDays.add(id);
  evDays.add(S.today());
  let days = [...evDays].sort().reverse();
  const limit = Number(q.get('n') || 7);
  if (one) days = [one];
  const shown = days.slice(0, limit);
  main.innerHTML = `
  <div class="row between"><h1 style="margin:0">공부 일지</h1>${one ? '<a class="btn sm" href="#/journal">전체 날짜</a>' : '<a class="btn sm" href="#/stats">공부 기록 그래프</a>'}</div>
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
        ${l.fs?.math ? `<span><b>${S.fmtDur(l.fs.math)}</b> 수학</span>` : ''}
      </div>
      ${list.length ? `<ul class="j-list">${list.map(entryHtml).join('')}</ul>` : '<p class="small muted">기록이 없다.</p>'}
      ${diary?.text || d === S.today() || one ? `<label class="field"><span>한 줄 회고 <span class="small muted" data-saved="${d}"></span></span><textarea class="diary" data-day="${d}" rows="2" style="min-height:56px" placeholder="오늘 잘된 것, 헷갈린 것, 내일 할 것">${esc(diary?.text || '')}</textarea></label>` : `<p class="small"><a href="#/journal?d=${d}">이날 회고 쓰기</a></p>`}
    </section>`;
  }).join('')}
  ${!one && days.length > limit ? `<a class="btn block" href="#/journal?n=${limit + 14}">이전 날짜 더 보기</a>` : ''}`;
  $$('textarea.diary').forEach(t => {
    let tm = null;
    t.addEventListener('input', () => {
      clearTimeout(tm);
      // 지워도 빈 글로 남긴다 (기록은 지우지 않는다)
      tm = setTimeout(() => { S.kvSet('diary', t.dataset.day, { text: t.value }); const m = $(`[data-saved="${t.dataset.day}"]`); if (m) m.textContent = '· 저장됨'; }, 700);
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
  <form id="mf" class="row" style="margin:8px 0"><input type="search" name="q" aria-label="형광펜·메모 찾기" placeholder="형광펜·메모에서 찾기" value="${esc(q.get('q') || '')}" style="flex:1"><button class="btn">찾기</button></form>
  <div class="chips" style="margin-bottom:6px"><a class="chip${!fs ? ' on' : ''}" href="${link({ s: '' })}">전체</a>${SUBJECTS.map(s => `<a class="chip${fs === s.id ? ' on' : ''}" href="${link({ s: s.id })}">${subjDot(s.id)}${s.name}</a>`).join('')}</div>
  <div class="chips" style="margin-bottom:12px"><a class="chip${!fc ? ' on' : ''}" href="${link({ c: '' })}">모든 색</a>${HL.COLORS.map(c => `<a class="chip${fc === c.id ? ' on' : ''}" href="${link({ c: c.id })}"><span class="hl-sw hl-${c.id}"></span>${c.name}</a>`).join('')}<a class="chip${q.get('memo') ? ' on' : ''}" href="${link({ memo: q.get('memo') ? '' : '1' })}">메모 있는 것만</a>${fp ? `<a class="chip on" href="${link({ pack: '' })}">${esc(D.db().byId[fp]?.title || fp)} ✕</a>` : ''}</div>
  ${notes.length && !fc && !term ? `<section class="card flat"><h2>단원 메모</h2>${notes.map(n => `<p><a href="#/pack?id=${encodeURIComponent(n.pack)}"><b>${esc(D.db().byId[n.pack]?.title || n.pack)}</b></a><br><span style="white-space:pre-wrap">${esc(n.text)}</span></p>`).join('')}</section>` : ''}
  ${packs.map(pk => {
    const p = D.db().byId[pk];
    return `<section class="card flat"><h2>${p ? subjDot(p.subject) + ' ' + esc(p.title) : esc(pk)}</h2><ul class="list">${byPack[pk].sort((a, b) => a.c - b.c).map(h => `<li class="item" style="align-items:flex-start"><span class="grow"><a class="hl-text hl-${h.color}" href="#/pack?id=${encodeURIComponent(h.pack)}${h.where ? `&src=${encodeURIComponent(h.where.slice(4))}` : ""}&mark=${h.id}">${esc(h.text)}</a>${h.note ? `<br><span class="small">메모: ${esc(h.note)}</span>` : ''}</span><span class="small muted">${S.fmtDate(S.dayOf(h.c))}</span></li>`).join('')}</ul></section>`;
  }).join('') || '<p class="muted">아직 없다. 자료 본문에서 글자를 길게 눌러 골라 본다.</p>'}`;
  $('#mf').addEventListener('submit', e => { e.preventDefault(); location.hash = link({ q: e.target.q.value.trim() }); });
}

// ================= 문제 하나의 기록 =================
function viewQuestion() {
  const { q } = params();
  const key = q.get('key') || '';
  const [pid, qid] = key.split('::');
  const pack = D.db().byId[pid];
  const qq = pack ? [...(pack.questions || []), ...(pack.book || [])].find(z => D.qkey(pack, z) === key || (!z._key && String(z.id) === qid)) : null;
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
    <div class="q-head">${subjDot(pack.subject)}<span class="tag">${TYPE_NAME[qq.type]}</span>${pr ? `<span class="tag">${pr.ok}/${pr.n} 맞음</span>${pr.wrong ? '<span class="tag bad">오답노트</span>' : ''}${pr.star ? '<span class="tag warn">헷갈림</span>' : ''}${pr.due ? `<span class="tag">다음 복습 ${pr.due.slice(5).replace('-', '/')}</span>` : ''}` : ''}</div>
    ${qq.context ? `<div class="q-ctx">${ctxHtml(qq.context)}</div>` : ''}
    <div class="q-text">${qHtml(qq.question)}</div>
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
    <textarea id="impText" aria-label="가져올 JSON" placeholder='{ "format": "study-hub/1", "id": "...", ... }' style="min-height:140px;font-size:.88rem"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn" id="impCheck">검사</button><button type="button" class="btn ghost" data-file="impFile">파일 고르기</button><input type="file" id="impFile" accept=".json,application/json,text/plain" multiple hidden></div>
    <div id="impOut"></div>
  </section>

  ${localList.length ? `<details class="card fold"><summary><h2 style="display:inline;margin:0">이 기기에 가져온 자료 ${localList.length}개</h2></summary><ul class="list">${localList.map(p => `<li class="item">${subjDot(p.subject)}<span class="grow">${esc(p.title)}<br><span class="small muted">${esc(p.id)} · 문제 ${(p.questions || []).length} · 카드 ${(p.cards || []).length}</span></span><button class="btn sm ghost" data-copy="${esc(p.id)}">JSON 복사</button><button class="btn sm ghost bad" data-del="${esc(p.id)}">지우기</button></li>`).join('')}</ul>
  <p class="small muted">"JSON 복사" 한 내용을 저장소 data/packs/과목/ 에 파일로 올리면 모든 기기에서 보인다.</p></details>` : ''}

  <section class="card" id="notionSync">
    <h2>Notion 자동 업데이트</h2>
    <p class="small">Notion "School / Exam" 의 주간 계획, 시험 범위 현황, 하루 공부 시간을 6시간마다 읽어 이 사이트에 넣는다. 내용은 암호로 잠가서 올라오니, 받은 비밀번호를 여기에 한 번 넣는다. 동기화를 켜 두면 다른 기기에도 비밀번호가 같이 간다.</p>
    ${(() => { const st = NT.status(); return st ? `<p class="small">마지막 Notion 내용: ${esc(String(st.generated || '').replace('T', ' ').slice(0, 16))}</p>` : ''; })()}
    <div class="row"><input type="password" id="ntKey" aria-label="Notion 업데이트 비밀번호" placeholder="${NT.getKey() ? '저장됨 (바꾸려면 새로 입력)' : 'Notion 업데이트 비밀번호'}" autocomplete="off" style="flex:1"><button class="btn pri" id="ntSave">저장하고 받기</button>${NT.getKey() ? '<button class="btn" id="ntPull">지금 받기</button>' : ''}</div>
  </section>

  <section class="card" id="sync">
    <h2>기록 동기화 (GitHub 비공개 Gist)</h2>
    <p class="small">푼 기록, 풀이 이력, 공부 일지, 형광펜·메모, 계획, 가져온 자료를 내 GitHub 의 <b>비공개 Gist</b> 에 쌓는다. 태블릿·휴대폰·컴퓨터에서 같은 토큰을 넣으면 기록이 합쳐진다. 지우는 일이 없어서 두 기기에서 동시에 공부해도 기록이 사라지지 않는다. API 키와 토큰은 올라가지 않는다.</p>
    ${SYNC.isOn() ? `
      <p>연결됨: <b>${esc(sc.login || '')}</b> · <a href="${SYNC.gistUrl()}" target="_blank" rel="noopener">Gist 보기</a></p>
      <p class="small" id="syncState">${syncText(st)}</p>
      <label class="row small"><input type="checkbox" id="syncAuto"${sc.auto ? ' checked' : ''}> 자동 동기화 (기록이 생기면 15초 뒤, 앱을 다시 열 때, 화면이 켜져 있으면 1분마다)</label>
      <div class="row" style="margin-top:8px"><button class="btn pri" id="syncNow">지금 동기화</button><button class="btn ghost bad" id="syncOff">연결 끊기</button></div>
      <details class="fold" style="margin-top:10px"><summary class="small">다른 기기에 넣을 토큰 꺼내기</summary>
        <p class="small muted">이 기기에 저장된 GitHub 토큰을 복사한다. GitHub 에서는 만든 뒤 다시 볼 수 없어서, 새 기기를 연결할 때 여기서 꺼낸다. 남에게 보내지 않는다.</p>
        <button class="btn sm" id="ghCopy">토큰 복사</button></details>
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
    <p class="small">이 기기에 쌓인 기록 ${S.getEvents().length.toLocaleString()}건 · 기록 저장 공간 ${(S.storageBytes() / 1048576).toFixed(2)}MB / 약 5MB (가져온 자료·원문은 따로 저장해서 여기 안 들어간다)</p>
    <p class="small muted">사이트 버전 ${esc(window.SH_VERSION || '-')} · <span id="offState">오프라인 모드 확인 중</span> <button class="btn sm ghost" id="updBtn">새 버전 확인</button></p>
    <div class="row"><button class="btn" id="exp">백업 파일 받기</button><button type="button" class="btn" data-file="impBk">백업 불러오기</button><input type="file" id="impBk" accept=".json" hidden></div>
    <p style="margin:18px 0 0"><button class="btn sm bad ghost" id="reset">기록 초기화</button></p>
  </section>`;

  { const go = params().q.get('go'); if (go) setTimeout(() => document.getElementById(go)?.scrollIntoView({ block: 'start' }), 60); }
  const ntMsg = r => ({ updated: 'Notion 계획을 새로 받았다.', same: '바뀐 게 없다.', nokey: '비밀번호를 넣어 줘.', none: '아직 올라온 Notion 내용이 없다. 예약 작업이 처음 돌 때까지 기다린다.', badkey: '비밀번호가 맞지 않다.', error: '받지 못했다. 인터넷을 확인해 줘.' }[r] || r);
  $('#ntSave')?.addEventListener('click', async () => {
    const k = $('#ntKey').value.trim();
    if (!k) return toast('비밀번호를 넣어 줘.');
    NT.setKey(k);
    const r = await NT.pull({ force: true });
    if (r === 'badkey') NT.setKey('');
    toast(ntMsg(r), 3500);
    if (r === 'updated') await D.loadAll();
    render.keepScroll = true; render();
  });
  $('#ntPull')?.addEventListener('click', async () => {
    const r = await NT.pull({ force: true }); toast(ntMsg(r), 3500);
    if (r === 'updated') { await D.loadAll(); render.keepScroll = true; render(); }
  });

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
      const bkp = (r.bookPatches || []).filter(b => typeof b.book_for === 'string' && !bad.has('책 문제 ' + b.book_for));
      const engPacks = Object.values(D.db().byId).filter(p => p.subject === 'eng');
      const guess = b => {
        if (D.db().byId[b.book_for]) return b.book_for;
        const m = String(b.title || '').match(/unit\s*0?(\d+)/i);
        if (m) { const hit = engPacks.find(p => new RegExp(`(unit|유닛|단원)\\s*0?${m[1]}(?!\\d)|^0?${m[1]}(?!\\d)`, 'i').test(`${p.title} ${p.unit || ''}`)); if (hit) return hit.id; }
        return '__new';
      };
      pendingImport = { packs: okPacks, exam: r.exam, textPatches: tp, plan: pl, bookPatches: bkp, pdfs: r.pdfs || [] };
      out.innerHTML = `<div class="${r.errors.length ? 'note' : 'note info'}" style="margin-top:10px">
        <p>${r.packs.length ? `자료 ${r.packs.length}개 중 ${okPacks.length}개 가져올 수 있다.` : ''}${tp.length ? ` 원문 ${tp.reduce((a, t) => a + t.texts.length, 0)}개 (${tp.map(t => esc(D.db().byId[t.texts_for]?.title || t.texts_for + ' (없는 자료)')).join(', ')}).` : ''}${r.exam ? ' 시험 정보도 들어 있다.' : ''}${pl ? ` 공부 계획 ${pl.weeks.length}주, 할 일 ${plCount}개 (지금 있는 계획을 바꾼다. 체크한 것은 그대로).` : ''}</p>
        ${bkp.length ? `<p class="small" style="margin-top:6px">책 문제 ${bkp.reduce((a, b) => a + b.book.length, 0)}개. 묶음마다 어느 영어 자료에 붙일지 고른다. 붙인 자료는 책 문제를 먼저 풀어야 공부자료가 열린다.</p>
          ${bkp.map((b, i) => `<label class="field" style="margin:6px 0"><span>${esc(b.title || b.book_for)} · ${b.book.length}문제</span><select data-bk="${i}">${engPacks.map(p => `<option value="${esc(p.id)}"${guess(b) === p.id ? ' selected' : ''}>${esc(p.title)}</option>`).join('')}<option value="__new"${guess(b) === '__new' ? ' selected' : ''}>새 자료로 만들기</option><option value="__skip">가져오지 않음</option></select></label>`).join('')}` : ''}
        ${okPacks.map(p => `<div class="small">${subjDot(p.subject)} ${esc(p.title)} · 문제 ${(p.questions || []).length} · 카드 ${(p.cards || []).length}${D.db().byId[p.id] ? ' <span class="tag warn">같은 id 덮어씀</span>' : ''}</div>`).join('')}
        ${r.errors.length ? `<details open><summary>고칠 것 ${r.errors.length}개</summary><ul class="small">${r.errors.slice(0, 30).map(m => `<li>${esc(m)}</li>`).join('')}</ul><p class="small">이 목록을 공부자료 Claude 에게 보내고 고쳐 달라고 하면 된다.</p></details>` : ''}
        ${r.pdfs?.length ? `<p class="small" style="margin-top:6px">PDF 원본 ${r.pdfs.length}개 (${fmtSize(r.pdfs.reduce((a, x) => a + x.data.length * 0.75, 0))}). 이 기기에만 저장되고, 자료 화면과 PDF 모아보기에서 열린다.</p>` : ''}
        ${okPacks.length || r.exam || tp.length || pl || bkp.length || r.pdfs?.length ? '<button class="btn pri" id="impGo" style="margin-top:8px">가져오기</button>' : ''}
      </div>`;
      $('#impGo')?.addEventListener('click', async e => {
        e.currentTarget.disabled = true; e.currentTarget.textContent = '가져오는 중…';
        if (pendingImport.packs.length) D.saveLocalPacks(pendingImport.packs);
        let pdfN = 0;
        if (pendingImport.pdfs.length) {
          const have = await PDF.listPdfs();
          for (const x of pendingImport.pdfs) {
            const bin = atob(x.data); const u8 = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            const old = have.find(h => h.name === x.name && h.size === u8.length);
            if (old) { await PDF.updatePdf(old.id, { pack: x.pack || old.pack, subject: x.subject || old.subject }); continue; }
            await PDF.addPdf(new Blob([u8], { type: 'application/pdf' }), { name: x.name, title: x.title, subject: x.subject, pack: x.pack });
            pdfN++;
          }
        }
        let bookN = 0;
        (pendingImport.bookPatches || []).forEach((b, i) => {
          const to = out.querySelector(`[data-bk="${i}"]`)?.value || '__new';
          if (to === '__skip') return;
          bookN += b.book.length;
          if (to === '__new') {
            const id = D.db().byId[b.book_for] ? b.book_for + '-book' : b.book_for;
            D.saveLocalPacks([{ format: 'study-hub/1', id, subject: 'eng', title: b.title || b.book_for, unit: b.unit, order: b.order, summary: b.summary || '책 문제', notes: '', book: b.book }]);
          } else D.saveBook(to, b.book);
        });
        if (pendingImport.plan) D.savePlan(pendingImport.plan);
        for (const tp2 of pendingImport.textPatches || []) tp2.texts.forEach((t, i) => SRC.saveText({ id: tp2.texts_for }, t.id ? String(t.id) : 'add-' + i, t.title || `본문 ${i + 1}`, t.body));
        if (pendingImport.exam && pendingImport.exam.subjects) {
          const sub = {};
          for (const id in pendingImport.exam.subjects) if (SUBJ[id]) { const v = pendingImport.exam.subjects[id]; sub[id] = {}; if ('date' in v) sub[id].date = v.date; if ('range' in v) sub[id].range = v.range; }
          D.saveExamLocal(sub);
        }
        await D.loadAll();
        toast(pendingImport.plan && !pendingImport.packs.length ? '공부 계획을 가져왔다. 시험 일정과 계획 화면에서 보인다.' : [pendingImport.packs.length ? `자료 ${pendingImport.packs.length}개` : '', (pendingImport.textPatches || []).length ? `원문 ${pendingImport.textPatches.length}묶음` : '', bookN ? `책 문제 ${bookN}개` : '', pdfN ? `PDF ${pdfN}개` : '', pendingImport.exam ? '시험 정보' : ''].filter(Boolean).join(', ') + ' 가져왔다.');
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
    // 큰 파일(PDF 가 든 것)은 입력 칸에 넣지 않는다. 태블릿이 멈출 수 있다
    const showText = t => { $('#impText').value = t.length < 300000 ? t : `(파일 ${files.map(f => f.name).join(', ')} — 너무 커서 여기에는 안 보여 준다)`; };
    if (texts.length === 1) { showText(texts[0]); return check(texts[0]); }
    try {
      const packs = [], pdfs = [];
      for (const t of texts) { const r = D.parseImport(t); packs.push(...r.packs, ...r.textPatches, ...r.bookPatches); pdfs.push(...r.pdfs); }
      const merged = JSON.stringify({ packs, ...(pdfs.length ? { pdfs } : {}) });
      showText(merged);
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
  $('#ghCopy')?.addEventListener('click', async () => {
    const t = SYNC.conf().token;
    try { await navigator.clipboard.writeText(t); toast('토큰을 복사했다. 다른 기기의 설정 → 동기화에 붙여넣는다.', 4000); }
    catch (e) { prompt('자동 복사가 막혔다. 아래 글을 길게 눌러 복사한다.', t); }
  });
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
  <section class="card"><div class="row between"><h2 style="margin:0">영어 자료에 책 문제만 더 받을 때</h2><button class="btn sm" data-copy-text="book">복사</button></div><p class="small muted">영어 Claude 채팅에 보낸다. 받은 JSON 을 자료 가져오기에 붙여넣으면 그 자료에 책 문제가 붙고, 자료를 열 때 책 문제를 먼저 풀게 된다.</p><pre class="prompt">${esc(PR.BOOK_PROMPT)}</pre></section>
  <section class="card"><div class="row between"><h2 style="margin:0">오류가 났을 때</h2><button class="btn sm" data-copy-text="fix">복사</button></div><pre class="prompt">${esc(PR.FIX_PROMPT)}</pre></section>
  <section class="card"><div class="row between"><h2 style="margin:0">시험 범위·날짜가 나왔을 때</h2><button class="btn sm" data-copy-text="range">복사</button></div><pre class="prompt">${esc(PR.RANGE_PROMPT)}</pre></section>`;
  $$('input[name="ps"]').forEach(r => r.addEventListener('change', () => { location.hash = '#/prompts?s=' + r.value + (light ? '&v=light' : ''); }));
  $$('input[name="pv"]').forEach(r => r.addEventListener('change', () => { location.hash = '#/prompts?s=' + sel + (r.value ? '&v=light' : ''); }));
  const texts = { main: text, fix: PR.FIX_PROMPT, range: PR.RANGE_PROMPT, texts: PR.TEXTS_PROMPT, book: PR.BOOK_PROMPT };
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
// 백지 복습 핵심어: 학생이 실제로 쓸 "답" 쪽 말을 모은다.
//  - 카드 뒷면 (앞면은 "작가", "주제" 같은 물음이라 뺀다)
//  - 정리 표의 내용 칸 (첫 칸은 항목 이름이라 뺀다)
//  - 굵은 글씨 중 "특징:" 처럼 항목 이름으로 쓴 것은 빼고 나머지
// 쉼표·가운뎃점으로 묶인 것은 나눈다. ':' 나 따옴표, 물음표가 든 조각, 너무 긴 조각은 버린다.
function keywordItems(p) {
  const out = new Map();
  let sec = '', lastRow = [];
  // 표 머리나 칸 이름으로 흔히 쓰는 말은 핵심어가 아니다
  const LABELS = new Set(['내용', '특징', '화자', '역할', '의미', '항목', '구분', '설명', '예시', '작가', '갈래', '성격', '제재', '주제', '운율', '표현', '구성', '정리', '비고', '원문', '현대어', '뜻']);
  const add = (raw, where) => {
    for (const part of String(raw).replace(/\([^)]*\)/g, '').replace(/<[^>]+>/g, '').split(/[,，·、;]|\s및\s|\s그리고\s/)) {
      const k = part.replace(/[*`]/g, '').replace(/^[\s\-–]+|[\s.。]+$/g, '').trim();
      if (k.length < 2 || k.length > 16 || LABELS.has(k) || /[:?'"‘’“”]/.test(k) || /^[\d\s.()·-]+$/.test(k) || out.has(k)) continue;
      out.set(k, where); lastRow.push(k);
    }
  };
  for (const line of String(p.notes || '').split('\n')) {
    const h = line.match(/^#{2,4}\s+(.+)$/);
    if (h) { sec = h[1].replace(/[*`]/g, '').replace(/\([^)]*\)/g, '').trim(); continue; }
    const cells = line.trim().startsWith('|') ? line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()) : null;
    if (cells) {
      // 구분선(|---|) 바로 위 줄은 표 머리라서 넣었던 것을 뺀다
      if (/^:?-{2,}/.test(cells[0] || '')) { lastRow.forEach(k => out.delete(k)); lastRow = []; continue; }
      lastRow = [];
      if (cells.length > 1) cells.slice(1).forEach(c => add(c, sec));
      continue;
    }
    lastRow = [];
    for (const m of line.matchAll(/\*\*([^*\n]{2,40})\*\*(.?)/g)) if (m[2] !== ':' && !/^\s*\(교과서/.test(line.slice(m.index + m[0].length - 1))) add(m[1], sec);
    for (const m of line.matchAll(/<mark>([^<\n]{2,40})<\/mark>/g)) add(m[1], sec);
  }
  for (const c of p.cards || []) add(c.back, '암기카드');
  return [...out].slice(0, 60).map(([k, sec]) => ({ k, sec }));
}
function keywordsOf(p) { return keywordItems(p).map(x => x.k); }
// 핵심어를 썼는지: 띄어쓰기·문장부호를 빼고 비교. 여러 낱말이면 절반 넘게 들어 있으면 쓴 것으로 본다.
function kwHit(k, mine) {
  const whole = nk(k);
  if (whole && mine.includes(whole)) return true;
  const toks = String(k).split(/[\s.,·'"()\[\]「」『』<>:;!?~-]+/).map(nk).filter(t => t.length >= 2);
  if (toks.length < 2) return false;
  return toks.filter(t => mine.includes(t)).length / toks.length > 0.5;
}
const nk = s => String(s).normalize('NFKC').toLowerCase().replace(/[\s.,·'"‘’“”()\[\]「」『』<>:;!?~-]/g, '');

function viewBlank() {
  const { q } = params();
  const id = q.get('pack');
  const p = id && D.db().byId[id];
  if (!p) {
    const packs = D.db().packs.filter(x => x.notes);
    const hist = Object.entries(S.kvAll('blank')).map(([id, v]) => ({ ...v, id })).sort((a, b) => b.t - a.t).slice(0, 10);
    main.innerHTML = `<h1>백지 복습</h1>
    <p class="small muted">자료를 덮고 그 단원에서 기억나는 것을 빈 종이에 쓰듯 다 써 본다. 그다음 자료와 비교해서 빠진 핵심어를 찾는다. 읽기만 하는 것보다 오래 남는다 (인출 연습).</p>
    <section class="card flat"><ul class="list">${packs.map(x => `<li><a class="item" href="#/blank?pack=${encodeURIComponent(x.id)}">${subjDot(x.subject)}<span class="grow">${esc(x.title)}</span><span class="small muted">핵심어 ${keywordsOf(x).length}</span></a></li>`).join('') || '<li class="item muted">본문이 있는 자료가 없다.</li>'}</ul></section>
    ${hist.length ? `<h2>최근 백지 복습</h2><section class="card flat"><ul class="list">${hist.map(h => `<li class="item"><span class="grow">${esc(D.db().byId[h.pack]?.title || h.pack)}<br><span class="small muted">${S.fmtDate(S.ymd(new Date(h.t)))} ${S.fmtTime(h.t)}</span></span><span class="tag ${h.cov >= 70 ? 'ok' : h.cov >= 40 ? 'warn' : 'bad'}">${h.cov}%</span><button type="button" class="btn sm ghost" data-bdel="${esc(h.id)}" aria-label="이 백지 복습 기록 지우기">지우기</button></li>`).join('')}</ul></section>` : ''}`;
    $$('[data-bdel]').forEach(b => b.addEventListener('click', () => { if (!confirm('이 백지 복습 기록을 지울까? (점수 기록만 지운다)')) return; S.kvDel('blank', b.dataset.bdel); render.keepScroll = true; render(); }));
    return;
  }
  if (!blank || blank.pack !== p.id) blank = { pack: p.id, text: '', phase: 'write', start: Date.now() };
  const kws = keywordsOf(p);
  if (blank.phase === 'write') {
    main.innerHTML = `<p class="small"><a href="#/pack?id=${encodeURIComponent(p.id)}">← ${esc(p.title)}</a></p>
    <h1>백지 복습 · ${esc(p.title)}</h1>
    <p class="small muted">자료를 보지 않고 이 단원에서 기억나는 것을 전부 쓴다. 개념, 순서, 예시, 헷갈리는 것까지. 남에게 설명하듯 쓰면 더 좋다 (파인만 기법). 핵심어 ${kws.length}개와 비교한다.</p>
    <section class="card"><div class="row between"><b>빈 종이</b><span class="timer" id="bTimer"></span></div>
      <textarea id="bText" aria-label="기억나는 것 쓰기" style="min-height:50vh;margin-top:8px" placeholder="생각나는 대로 다 쓴다.">${esc(blank.text)}</textarea>
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
      const hit = kws.filter(k => kwHit(k, mine));
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
  <p class="result-line">핵심어 <b>${kws.length}개 중 ${blank.hit.length}개</b>를 떠올렸다 (${blank.cov}%)</p>
  ${blank.miss.length ? (() => {
    // 빠진 핵심어는 소제목별로 묶고, 처음 10개만 펼친다
    const secOf = Object.fromEntries(keywordItems(p).map(x => [x.k, x.sec || '기타']));
    const groups = {};
    for (const k of blank.miss) (groups[secOf[k] || '기타'] = groups[secOf[k] || '기타'] || []).push(k);
    let shown = 0;
    const chip = k => `<span class="chip miss">${esc(k)}</span>`;
    const first = [], rest = [];
    for (const [g, ks] of Object.entries(groups)) {
      const a = ks.slice(0, Math.max(0, 10 - shown)); shown += a.length;
      if (a.length) first.push(`<div class="kw-g"><span class="small muted">${esc(g)}</span><div class="chips">${a.map(chip).join('')}</div></div>`);
      if (ks.length > a.length) rest.push(`<div class="kw-g"><span class="small muted">${esc(g)}</span><div class="chips">${ks.slice(a.length).map(chip).join('')}</div></div>`);
    }
    return `<section class="card flat"><h2>빠진 핵심어 ${blank.miss.length}개</h2>${first.join('')}${rest.length ? `<details class="fold"><summary class="small">나머지 ${blank.miss.length - shown}개 더 보기</summary>${rest.join('')}</details>` : ''}<p class="small muted" style="margin-top:8px">자료에서 빨간 밑줄로 표시했다. 이것만 다시 읽고 내일 한 번 더 백지 복습을 한다.</p></section>`;
  })() : '<p class="note info">핵심어를 다 떠올렸다.</p>'}
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
  <p class="small muted">${ex.date ? `${S.fmtDate(ex.date)} · ${dLabel(ex.date)}` : `${subjName(sel)} 시험이 어느 날인지 아직 안 정했다 · <a href="#/plan">${subjName(sel)} 날짜 넣기</a>`}${ex.range ? ' · 범위: ' + esc(ex.range) : ''}</p>
  <div class="row noprint" style="margin:10px 0">${wrong.length + star.length ? `<button class="btn pri" id="fRetry">오답·헷갈린 문제 ${wrong.length + star.length + guessed.length}개 다시 풀기</button>` : ''}${cards.length ? `<button class="btn" id="fCards">모르는 카드 ${cards.length}장</button>` : ''}</div>
  ${notes.length ? `<section class="card"><h2>내 단원 메모</h2>${notes.map(n => `<p><b>${esc(D.db().byId[n.pack]?.title || '')}</b><br><span style="white-space:pre-wrap">${esc(n.text)}</span></p>`).join('')}</section>` : ''}
  ${hls.length ? `<section class="card"><h2>형광펜·메모 ${hls.length}</h2><ul class="list">${hls.map(h => `<li class="item" style="display:block"><span class="hl-text hl-${h.color}">${esc(h.text)}</span>${h.note ? `<br><span class="small">메모: ${esc(h.note)}</span>` : ''}</li>`).join('')}</ul></section>` : ''}
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
    if (/\\n/.test(t)) add('err', where, '줄바꿈 기호(역슬래시와 n)가 글자로 남아 있다. 줄이 안 바뀌고 기호가 그대로 보인다.');
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
  [...(p.questions || []).map((q, i) => [q, `문제 ${i + 1}`]), ...(p.book || []).map((q, i) => [q, `책 문제 ${q.source || i + 1}`])].forEach(([q, w]) => {
    scanText(w, q.question); scanText(w + ' 지문', q.context); scanText(w + ' 해설', q.explanation);
    if ((/윗글|다음 글|아래 글|<보기>|\[보기\]|다음 시(?![각간])|다음 자료/.test(q.question) || (CITE_RE.test(q.question) && !SRC.textsOf(p).some(t => t.body))) && !q.context) add('err', w, `"${q.question.slice(0, 30)}…" — 지문이나 <보기> 를 가리키는데 지문 칸이 비어 있다.`);
    if (q.type === 'mcq') {
      if (q.choices.some(c => /^\s*([①②③④⑤]|\(?[1-5][).]\s)/.test(c))) add('warn', w, '보기 앞에 ①② 나 1) 번호가 붙어 있다. 사이트가 번호를 또 붙여서 두 번 보인다.');
      if (new Set(q.choices.map(c => c.trim())).size !== q.choices.length) add('err', w, '똑같은 보기가 두 개 있다.');
      const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
      if (ans.length > 1 && !/모두|두 개|2개|고른 것|있는 대로/.test(q.question)) add('warn', w, '답이 여러 개인데 발문에 "모두 고르면" 같은 말이 없다.');
    }
    if (q.type === 'short') {
      // 쉼표는 빈칸 여러 개로 보고 순서 상관없이 채점한다. "/" 나 "또는" 은 다른 표기를 한 칸에 몰아 쓴 것일 수 있다
      if (q.answers.some(a => /\/|또는/.test(a) && a.length > 3)) add('warn', w, `정답 "${q.answers.find(a => /\/|또는/.test(a))}" 에 / 나 "또는" 이 있다. 다른 표기라면 정답을 하나씩 따로 적어야 채점된다.`);
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
  <p class="small muted">자료 목록에 보이는 ${D.db().packs.length}개를 검사했다 (합친 자료는 하나로 센다). 화면에서 깨지는 곳(수식, 굵게 짝, 줄바꿈 기호, 표)과 채점이 틀어질 곳(지문 없는 문제, 같은 보기, 정답 표기)을 찾는다.</p>
  <p class="result-line"><b style="color:${nErr ? 'var(--bad)' : 'var(--ok)'}">고쳐야 함 ${nErr}개</b> · 확인 ${nWarn}개</p>
  <p><a class="small" href="#/check${showInfo ? '' : '?all=1'}">${showInfo ? '참고 항목 숨기기' : '참고 항목(해설 없음, 원문 없음)도 보기'}</a></p>
  ${Object.values(byPack).sort((a, b) => b.filter(x => x.level === 'err').length - a.filter(x => x.level === 'err').length).map(list => {
    const p = list[0].pack;
    const fix = `네가 준 "${p.title}" (id: ${p.id}) 자료에서 아래 문제가 나왔어. 고친 JSON 을 다시 줘. id 는 바꾸지 마.\n\n${list.filter(x => x.level !== 'info').map(x => `- ${x.where}: ${x.msg}`).join('\n')}`;
    return `<section class="card"><div class="row between"><h2 style="margin:0">${subjDot(p.subject)} <a href="#/pack?id=${encodeURIComponent(p.id)}">${esc(p.title)}</a></h2>${list.some(x => x.level !== 'info') ? `<button class="btn sm" data-fix="${esc(p.id)}">고칠 프롬프트 복사</button>` : ''}</div>
      <ul class="list">${list.map(x => `<li class="item" style="align-items:flex-start">${tag[x.level]}<span class="grow small"><b>${esc(x.where)}</b> ${esc(x.msg)}</span></li>`).join('')}</ul><pre class="prompt" hidden data-fixtext="${esc(p.id)}">${esc(fix)}</pre></section>`;
  }).join('') || '<p class="note info">고칠 곳이 없다.</p>'}`;
  $$('[data-fix]').forEach(b => b.addEventListener('click', () => { const pre = main.querySelector(`[data-fixtext="${CSS.escape(b.dataset.fix)}"]`); copyText(pre.textContent, pre); }));
}

// ================= 더보기, 도움말 =================
// ================= 수학: 자료 없이 공부 시간만 =================
function mathTotal() { return S.subjectTimeEvents('math').reduce((a, e) => a + e.s, 0); }
const hm = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function stopClock() {
  const m = S.load('mclock', null); S.remove('mclock'); syncClockPill();
  if (!m) return;
  const sub = m.sub || 'math';
  const sec = S.recordSubjectTime(sub, m.start, Date.now());
  toast(sec ? `${subjName(sub)} ${S.fmtDur(sec)} 기록했다.` : '30초보다 짧아서 기록하지 않았다.');
}
// 스톱워치가 돌고 있으면 머리띠에 과목과 시간을 띄운다. 누르면 공부 시간 화면
let clockPill = null;
function syncClockPill() {
  if (!clockPill) {
    clockPill = document.createElement('a');
    clockPill.className = 'clockpill'; clockPill.href = '#/math';
    document.getElementById('topDday')?.after(clockPill);
  }
  clearInterval(syncClockPill._t);
  const m = S.load('mclock', null), tm = S.load('timer', null);
  clockPill.hidden = !m && !tm;
  if (!m && !tm) return;
  // 스톱워치는 지난 시간, 집중 타이머는 남은 분을 보여 준다
  const upd = () => {
    if (m) { const sec = Math.floor((Date.now() - m.start) / 1000); clockPill.textContent = `${subjName(m.sub || 'math')} 재는 중 ${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}`; }
    else { const left = Math.max(0, Math.ceil((tm.start + tm.len * 60000 - Date.now()) / 60000)); clockPill.textContent = `집중 ${left}분 남음`; }
  };
  upd(); syncClockPill._t = setInterval(upd, 15000);
}
function viewMath() {
  const { q } = params();
  const mc = S.load('mclock', null);
  const log = S.getLog();
  const today = S.today();
  const recent = S.subjectTimeEvents().slice().sort((a, b) => b.t - a.t).slice(0, 15);
  const allSubj = [TIME_SUBJ.math, ...SUBJECTS];
  const lastSub = S.load('clockSub', 'math');
  const subSel = name => `<select name="${name}">${allSubj.map(x => `<option value="${x.id}"${x.id === (q.get('sub') || lastSub) ? ' selected' : ''}>${x.name}</option>`).join('')}</select>`;
  const days = Array.from({ length: 7 }, (_, i) => S.addDays(today, -i));
  main.innerHTML = `
  <h1>공부 시간 재기</h1>
  <p class="small muted">수학은 공부자료 없이 공부한 시간만 잰다. 다른 과목도 책으로 공부할 때 여기서 잴 수 있다. 잰 시간은 공부 일지, 기록 그래프, 과목별 시간에 들어간다.</p>

  <section class="card">
    <h2>스톱워치</h2>
    <p class="small muted">교과서·문제집으로 공부할 때도 다른 과목을 골라 잴 수 있다.</p>
    <p class="timer" id="mcT" style="font-size:2.4rem;margin:6px 0">0:00:00</p>
    <div class="row">${mc ? `<span>${subjDot(mc.sub || 'math')} ${subjName(mc.sub || 'math')}</span><button class="btn bad" id="mcStop">멈추고 기록</button><button class="btn ghost" id="mcDrop">기록 안 하고 멈추기</button>` : `<label class="field" style="margin:0"><span>과목</span>${subSel('csub')}</label><button class="btn pri" id="mcGo">시작</button>`}</div>
    <p class="small muted">${mc ? `${S.fmtTime(mc.start)}에 시작. ` : ''}다른 화면으로 가거나 화면을 꺼도 계속 잰다. 수학 오늘 ${S.fmtDur(log[today]?.fs?.math || 0)} · 누적 ${S.fmtDur(mathTotal())}</p>
  </section>

  ${(() => {
    const tm = S.load('timer', null);
    const fmin = S.getEvents().filter(e => e.k === 'm').reduce((a, e) => a + (e.min || 0), 0);
    return `<section class="card">
    <h2>집중 타이머</h2>
    <p class="small muted">정한 시간 동안 한 가지만 한다. 끝까지 채우면 공부 일지에 남는다.</p>
    <p class="timer" id="ft" style="font-size:2.2rem;margin:6px 0">${tm ? '' : '25:00'}</p>
    <div class="row">${tm ? '<button class="btn bad" id="tStop">멈추기</button>' : [25, 50].map(m => `<button class="btn" data-tm="${m}">${m}분 시작</button>`).join('')}</div>
    ${fmin ? `<p class="small muted">지금까지 ${S.fmtDur(fmin * 60)}.</p>` : ''}
  </section>`;
  })()}

  <section class="card">
    <h2>빈 시간 채우기</h2>
    <p class="small muted">고른 시간 안에서 공부(자료 읽기, 문제, 카드, 타이머, 잰 시간)로 기록되지 않은 시간을 찾아 고른 과목 시간으로 넣는다. 1분보다 짧은 틈은 뺀다. 하루는 새벽 4시에 바뀌므로 00:00~03:59 는 고른 날짜의 밤(다음 날 새벽)이다.</p>
    <form id="gapF" class="row" style="align-items:flex-end">
      <label class="field" style="margin:0"><span>과목</span>${subSel('sub')}</label>
      <label class="field" style="margin:0"><span>날짜</span><input type="date" name="d" value="${esc(q.get('d') || today)}" max="${today}"></label>
      <label class="field" style="margin:0"><span>부터</span><input type="time" name="a" value="${esc(q.get('fill') || '')}" required></label>
      <label class="field" style="margin:0"><span>까지 (비우면 지금)</span><input type="time" name="b" value="${esc(q.get('to') || '')}"></label>
      <button class="btn">빈 시간 찾기</button>
    </form>
    <div id="gapOut"></div>
  </section>

  <section class="card">
    <h2>최근 7일 수학</h2>
    ${days.some(d => log[d]?.fs?.math) ? `<ul class="list">${days.filter(d => log[d]?.fs?.math).map(d => `<li class="item"><span class="grow">${S.fmtDate(d)}</span><b class="mono">${S.fmtDur(log[d].fs.math)}</b></li>`).join('')}</ul><p class="small muted">7일 합계 ${S.fmtDur(days.reduce((a, d) => a + (log[d]?.fs?.math || 0), 0))}</p>` : '<p class="small muted">최근 7일 동안 잰 수학 시간이 없다.</p>'}
  </section>

  <section class="card">
    <h2>기록</h2>
    ${recent.length ? `<ul class="list">${recent.map(e => `<li class="item">${subjDot(e.sub)}<span class="grow">${subjName(e.sub)} · ${S.fmtDate(S.dayOf(e.t))} ${hm(e.from)}~${hm(e.t)}</span><b class="mono">${S.fmtDur(e.s)}</b><button class="btn sm ghost" data-mx="${e.id}" aria-label="${subjName(e.sub)} ${hm(e.from)}~${hm(e.t)} 기록 지우기">지우기</button></li>`).join('')}</ul>` : '<p class="small muted">아직 없다.</p>'}
  </section>`;

  const upd = () => {
    const el = document.getElementById('mcT');
    const m = S.load('mclock', null);
    if (!el) return clearInterval(viewMath._t);
    const sec = m ? Math.floor((Date.now() - m.start) / 1000) : 0;
    el.textContent = `${Math.floor(sec / 3600)}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  };
  clearInterval(viewMath._t); upd(); if (mc) viewMath._t = setInterval(upd, 1000);
  $$('[data-tm]').forEach(b => b.addEventListener('click', () => {
    // 스톱워치와 같이 돌면 시간이 두 번 셀 수 있어서 하나만 돌게 한다
    if (S.load('mclock', null) && !confirm('스톱워치가 돌고 있다. 스톱워치를 멈추고(기록하고) 집중 타이머를 켤까?')) return;
    if (S.load('mclock', null)) stopClock();
    S.save('timer', { start: Date.now(), len: Number(b.dataset.tm) }); startTimerLoop(); render.keepScroll = true; render();
  }));
  $('#tStop')?.addEventListener('click', () => {
    const t = S.load('timer', null);
    if (t) S.recordFocus(Math.floor((Date.now() - t.start) / 60000));
    S.remove('timer'); syncClockPill(); toast('멈췄다. 지난 시간은 기록했다.'); render.keepScroll = true; render();
  });
  startTimerLoop();
  $('#mcGo')?.addEventListener('click', () => { if (S.load('timer', null)) { if (!confirm('집중 타이머가 돌고 있다. 타이머를 멈추고(지난 시간은 기록) 스톱워치를 켤까?')) return; const t = S.load('timer', null); S.recordFocus(Math.floor((Date.now() - t.start) / 60000)); S.remove('timer'); } const sub = $('[name="csub"]').value; reader.flush(); S.save('clockSub', sub); S.save('mclock', { start: Date.now(), sub }); syncClockPill(); render(); });
  $('#mcStop')?.addEventListener('click', () => { stopClock(); render(); });
  $('#mcDrop')?.addEventListener('click', () => { if (!confirm('지금까지 잰 시간을 버릴까?')) return; S.remove('mclock'); syncClockPill(); render(); });
  $$('[data-mx]').forEach(b => b.addEventListener('click', () => { if (!confirm('이 공부 시간 기록을 지울까? 지운 시간은 공부 시간에서 빠진다.')) return; S.cancelSubjectTime(b.dataset.mx); toast('지웠다.'); render.keepScroll = true; render(); }));

  // 날짜는 공부한 날 기준이라 새벽 4시 전 시각은 그다음 날 새벽이다 (예: 22일 03:00 = 23일 새벽 3시)
  const at = (d, t) => { const [y, mo, da] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(y, mo - 1, da + (h < S.DAY_START_HOUR ? 1 : 0), h, mi).getTime(); };
  const find = () => {
    const f = $('#gapF');
    const d = f.d.value || today;
    if (!f.a.value) return null;
    const from = at(d, f.a.value);
    let to = f.b.value ? at(d, f.b.value) : Date.now();
    to = Math.min(to, Date.now());
    const m = S.load('mclock', null);
    if (m) to = Math.min(to, m.start); // 지금 재는 중인 시간은 스톱워치가 넣는다
    reader.flush();
    return { from, to, gaps: to > from ? S.freeGaps(from, to) : [] };
  };
  const show = () => {
    const r = find();
    const out = $('#gapOut');
    if (!r) { out.innerHTML = ''; return; }
    if (r.to <= r.from) { out.innerHTML = '<p class="note" style="margin-top:10px">끝 시각이 시작보다 앞이다.</p>'; return; }
    const tot = r.gaps.reduce((a, [x, y]) => a + (y - x) / 1000, 0);
    const sn = subjName($('#gapF').sub.value);
    out.innerHTML = `<div class="note info" style="margin-top:10px">
      <p>${hm(r.from)}~${hm(r.to)} 중 빈 시간 <b>${S.fmtDur(tot)}</b> (${r.gaps.length}토막)</p>
      ${r.gaps.length ? `<ul class="small">${r.gaps.map(([x, y]) => `<li>${hm(x)}~${hm(y)} · ${S.fmtDur((y - x) / 1000)}</li>`).join('')}</ul>
      <button class="btn pri" id="gapGo">${sn} 시간으로 넣기</button>` : '<p class="small">이 시간은 이미 다 공부 기록이 있다.</p>'}
    </div>`;
    $('#gapGo')?.addEventListener('click', () => {
      const r2 = find(); let n = 0; const sub = $('#gapF').sub.value;
      for (const [x, y] of r2.gaps) n += S.recordSubjectTime(sub, x, y);
      toast(`${subjName(sub)} ${S.fmtDur(n)} 넣었다.`, 3000);
      location.hash = '#/math';
      render();
    });
  };
  $('#gapF').addEventListener('submit', e => { e.preventDefault(); show(); });
  if (q.get('fill')) show();
}

// ================= PDF 원본 =================
// 공부 Claude 에게 받은 PDF 를 이 기기에 넣어 두고 사이트 안에서 본다. 자료에 이어 두면 자료 화면에서 바로 연다.
let pdfView = null;
function fmtSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }
// 파일 이름으로 이어 둘 자료를 찾는다: 자료의 pdf_name 이 같거나, 제목이 파일 이름에 들어 있으면
function guessPack(name) {
  const base = name.replace(/\.pdf$/i, '').toLowerCase().replace(/[\s_\-]+/g, '');
  const ps = D.db().packs;
  return ps.find(p => p.pdf_name && p.pdf_name.toLowerCase() === name.toLowerCase())
    || ps.find(p => { const t = p.title.toLowerCase().replace(/[\s_\-]+/g, ''); return t.length >= 3 && (base.includes(t) || t.includes(base)); }) || null;
}
async function viewPdf() {
  const { q } = params();
  if (pdfView) { pdfView.destroy(); pdfView = null; }
  const id = q.get('id');
  if (id) return viewPdfOne(id, q);
  const sel = q.get('s') || '';
  const all = await PDF.listPdfs();
  if (params().path !== '/pdf') return;
  const list = all.filter(x => !sel || x.subject === sel || (sel === 'none' && !x.subject));
  const packOpts = cur => `<option value="">자료 없음</option>${SUBJECTS.map(s => { const ps = D.db().packs.filter(p => p.subject === s.id); return ps.length ? `<optgroup label="${s.name}">${ps.map(p => `<option value="${esc(p.id)}"${p.id === cur ? ' selected' : ''}>${esc(p.title)}</option>`).join('')}</optgroup>` : ''; }).join('')}`;
  const subjOpts = cur => `<option value="">과목 없음</option>${SUBJECTS.map(s => `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${s.name}</option>`).join('')}`;
  const groups = [...SUBJECTS, { id: null, name: '과목 없음' }].map(s => {
    const xs = list.filter(x => (x.subject || null) === s.id);
    if (!xs.length) return '';
    return `<div class="sec-title"><h2>${s.id ? subjDot(s.id) : ''} ${s.name}</h2><span class="small muted">${xs.length}개</span></div>
    <section class="card flat"><ul class="list">${xs.map(x => { const pk = x.pack && D.db().byId[x.pack]; return `<li class="item pdf-item">
      <a class="grow" href="#/pdf?id=${x.id}"><b>${esc(x.title)}</b><br><span class="small muted">${pk ? `자료: ${esc(pk.title)} · ` : ''}${fmtSize(x.size)} · ${S.fmtDate(S.dayOf(x.c))}</span></a>
      <details class="pdf-edit"><summary class="btn sm ghost">고치기</summary>
        <div class="stack" style="margin-top:8px">
          <label class="field"><span>이름</span><input data-pt="${x.id}" value="${esc(x.title)}"></label>
          <label class="field"><span>과목</span><select data-ps="${x.id}">${subjOpts(x.subject)}</select></label>
          <label class="field"><span>이어 둘 자료</span><select data-pp="${x.id}">${packOpts(x.pack)}</select></label>
          <div class="row"><button class="btn sm pri" data-psave="${x.id}">저장</button><button class="btn sm bad ghost" data-pdel="${x.id}">지우기</button></div>
        </div></details></li>`; }).join('')}</ul></section>`;
  }).join('');
  main.innerHTML = `
  <p class="small"><a href="#/study${sel && sel !== 'none' ? '?s=' + sel : ''}">← 공부자료</a></p>
  <h1>PDF 모아보기</h1>
  <p class="small muted">공부 Claude 에게 받은 PDF 원본을 넣어 두고 여기서 본다. PDF 는 <b>이 기기에만</b> 저장되고 동기화되지 않는다. 다른 기기에서도 보려면 그 기기에서 한 번 더 넣는다.</p>
  <section class="card">
    <button type="button" class="btn pri" data-file="pdfIn">PDF 넣기 (여러 개 가능)</button><input type="file" id="pdfIn" accept="application/pdf,.pdf" multiple hidden>
    <p class="small muted" style="margin:8px 0 0">파일 이름과 제목이 맞는 자료가 있으면 그 자료에 저절로 이어 둔다. 이어 둔 자료 화면에 "PDF 원본 보기" 가 생긴다.</p>
    <div id="pdfMsg"></div>
  </section>
  ${all.length ? chipGroup('s', [{ value: '', label: '전체' }, ...SUBJECTS.filter(s => all.some(x => x.subject === s.id)).map(s => ({ value: s.id, label: s.name, dot: true }))], [sel], false) : ''}
  ${groups || `<p class="muted" style="margin-top:14px">${all.length ? '이 과목 PDF 가 없다.' : '아직 넣은 PDF 가 없다.'}</p>`}
  <p class="small muted" style="margin-top:14px">PDF 보기는 <a href="https://mozilla.github.io/pdf.js/" target="_blank" rel="noopener">pdf.js</a> (Apache 2.0) 를 쓴다.</p>`;
  $$('input[name="s"]').forEach(r => r.addEventListener('change', () => { location.hash = '#/pdf' + (r.value ? '?s=' + r.value : ''); }));
  $('#pdfIn').addEventListener('change', async e => {
    const files = [...e.target.files].filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (!files.length) return;
    $('#pdfMsg').innerHTML = '<p class="small">저장하는 중…</p>';
    const done = [];
    try {
      for (const f of files) {
        const pk = guessPack(f.name);
        await PDF.addPdf(f, { pack: pk?.id || null, subject: pk?.subject || (sel && sel !== 'none' ? sel : null) });
        done.push(`${esc(f.name)}${pk ? ` → ${esc(pk.title)}` : ''}`);
      }
      toast(`PDF ${done.length}개 넣었다.`);
      render();
    } catch (err) {
      $('#pdfMsg').innerHTML = `<p class="note">저장하지 못했다: ${esc(err.message)}. 기기 저장 공간을 확인한다.</p>`;
    }
  });
  $$('[data-psave]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.psave;
    const pack = $(`[data-pp="${id}"]`).value || null;
    let subject = $(`[data-ps="${id}"]`).value || null;
    if (pack && !subject) subject = D.db().byId[pack]?.subject || null;
    await PDF.updatePdf(id, { title: $(`[data-pt="${id}"]`).value.trim() || 'PDF', subject, pack });
    toast('저장했다.'); render.keepScroll = true; render();
  }));
  $$('[data-pdel]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('이 PDF 를 이 기기에서 지울까? 자료와 기록은 그대로다.')) return;
    await PDF.deletePdf(b.dataset.pdel); toast('지웠다.'); render.keepScroll = true; render();
  }));
}
async function viewPdfOne(id, q) {
  const x = await PDF.getPdf(id);
  if (params().path !== '/pdf') return;
  if (!x) { main.innerHTML = '<p class="note">이 기기에 없는 PDF 다. <a href="#/pdf">PDF 모아보기</a></p>'; return; }
  const pk = x.pack && D.db().byId[x.pack];
  let zoom = Number(S.load('pdfZoom', 1)) || 1;
  main.innerHTML = `
  <p class="small"><a href="#/pdf${x.subject ? '?s=' + x.subject : ''}">← PDF 모아보기</a>${pk ? ` · <a href="#/pack?id=${encodeURIComponent(pk.id)}">${esc(pk.title)} 자료 보기</a>` : ''}</p>
  <div class="row between pdf-bar noprint"><h1 style="margin:0;font-size:1.15rem">${x.subject ? subjDot(x.subject) + ' ' : ''}${esc(x.title)}</h1>
    <span class="row"><span class="small muted" id="pdfPages"></span><button class="btn sm" id="zOut" aria-label="작게">−</button><span class="small mono" id="zVal">${Math.round(zoom * 100)}%</span><button class="btn sm" id="zIn" aria-label="크게">+</button></span></div>
  <div id="pdfBox" class="pdf-box"><p class="muted">PDF 여는 중…</p></div>`;
  const box = $('#pdfBox');
  const draw = async () => {
    if (pdfView) { pdfView.destroy(); pdfView = null; }
    try {
      pdfView = await PDF.renderPdf(box, x.blob, { zoom, onPages: n => { const el = document.getElementById('pdfPages'); if (el) el.textContent = `${n}쪽`; } });
    } catch (err) {
      box.innerHTML = `<p class="note">PDF 를 열지 못했다: ${esc(err.message)}</p>`;
    }
  };
  const setZoom = z => { zoom = Math.min(3, Math.max(0.5, Math.round(z * 4) / 4)); S.save('pdfZoom', zoom); $('#zVal').textContent = Math.round(zoom * 100) + '%'; draw(); };
  $('#zIn').addEventListener('click', () => setZoom(zoom + 0.25));
  $('#zOut').addEventListener('click', () => setZoom(zoom - 0.25));
  draw();
}

function viewMore() {
  const links = [
    ['#/math', '공부 시간 재기 (수학)', '자료 없이 시간만 잰다. 스톱워치, 집중 타이머, 빈 시간 채우기'],
    ['#/pdf', 'PDF 모아보기', '공부 Claude 에게 받은 PDF 원본. 이 기기에만 저장'],
    ['#/journal', '공부 일지', '날짜별로 쌓인 공부 흔적과 한 줄 회고'],
    ['#/blank', '백지 복습', '자료를 안 보고 기억나는 것을 다 써 본 뒤 비교 (서울대생 백지 공부법·파인만 기법)'],
    ['#/final', '시험 전 정리', '과목별 단원 메모·형광펜·오답·헷갈린 문제를 한 장으로'],
    ['#/check', '자료 점검', '공부자료에 표시 오류나 형식 문제가 있는지 찾기'],
    ['#/marks', '형광펜·메모 모아보기', '자료에 칠한 곳과 메모만 훑어보기'],
    ['#/cards', '암기카드', '용어, 단어, 연도를 카드로 외운다'],
    ['#/gen', 'AI 문제 만들기', '자료를 보고 새 문제를 만든다'],
    ['#/plan', '시험 일정과 계획', '과목별 날짜·범위, 할 일 목록'],
    ['#/stats', '공부 기록과 그래프', '잔디 달력, 누적 그래프, 정답률 변화, 쌓은 기록'],
    ['#/prompts', '공부자료 Claude 프롬프트', '과목별 프롬프트 복사'],
    ['#/settings', '설정', '기록 동기화, API 키, 자료 가져오기, 백업'],
    ['#/help', '사용법', '자료를 넣는 방법과 기능 설명'],
  ];
  // 쓰임새대로 묶는다: 공부할 때 / 기록 보기 / 자료 관리
  const groups = [
    ['공부할 때', ['#/cards', '#/blank', '#/final', '#/math', '#/gen']],
    ['기록과 계획', ['#/plan', '#/journal', '#/stats', '#/marks']],
    ['자료와 설정', ['#/pdf', '#/check', '#/prompts', '#/settings', '#/help']],
  ];
  const byHref = Object.fromEntries(links.map(l => [l[0], l]));
  main.innerHTML = `<h1>더보기</h1><div class="more-grid">${groups.map(([name, hs]) => `<section class="card flat"><h2>${name}</h2><ul class="list">${hs.map(h => byHref[h]).filter(Boolean).map(([h, t, d]) => `<li><a class="item" href="${h}"><span class="grow"><b>${t}</b><br><span class="small muted">${d}</span></span><span class="go" aria-hidden="true">›</span></a></li>`).join('')}</ul></section>`).join('')}</div>`;
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
- **섞어 풀기** (인터리빙): 홈의 "더 풀기 → 섞어 풀기" 는 복습할 문제·오답·안 푼 문제 20개를 과목을 번갈아 섞어 낸다. 한 과목만 몰아 풀 때보다 시험에서 더 잘 떠오른다.
- **시험 전 정리**: 더보기 → 시험 전 정리. 과목마다 내 단원 메모, 형광펜·메모, 오답, 헷갈린 문제, 찍어서 맞힌 문제, 모르는 카드를 한 장에 모은다. 시험 3일 전부터는 홈에 바로가기가 뜬다.
- **자료 점검**: 더보기 → 자료 점검. 수식(LaTeX), 짝 안 맞는 굵게, 줄바꿈 기호가 글자로 남은 곳, 표 칸 수, 지문 없는 문제, 보기 번호 중복, 정답 표기 문제를 찾고 고칠 프롬프트를 복사해 준다.

## 복습 순서

맞힌 문제는 1·2·4·7·14일 뒤에 다시 나온다. 틀리면 다음 날 다시 나온다. 홈의 "복습 n문제" 버튼이 그날 풀 문제다.
오답노트는 틀리거나 부분 점수를 받은 문제를 모은다. 두 번 연속 맞히거나 "이제 안다" 를 누르면 빠진다.

## 실전 모드

문제 풀기에서 방식을 "실전" 으로 고르면 제한 시간 안에 다 풀고 한꺼번에 채점한다. 시험 전 주에 과목별로 한 번씩 해 본다.

## 공부 흔적

- **공부 일지**: 자료를 읽은 시간, 푼 문제 묶음과 결과, 카드, 실전, 질문, 형광펜, 끝낸 계획이 시각과 함께 날짜별로 쌓인다. 날마다 한 줄 회고를 남길 수 있다.
- **풀이 이력**: 한 문제를 여러 번 풀면 매번 쓴 답, 결과, AI 채점이 모두 남는다. 채점 결과 아래 "풀이 이력" 이나 오답노트에서 본다.
- **PDF 원본**: [자료 → PDF 원본 모아보기] 에서 공부 Claude 에게 받은 PDF 를 넣는다. 이 기기에만 저장된다(동기화 안 됨). 자료에 이어 두면 자료 화면 위에 "PDF 원본 보기" 가 생긴다. −/+ 로 크기를 바꾼다.
- **Notion 자동 업데이트**: Notion "School / Exam" 의 주간 계획, 시험 범위 회독 현황, 하루 공부 시간표를 6시간마다 읽어 [시험 일정과 계획](#/plan) 과 홈에 넣는다. 설정 → Notion 자동 업데이트에 비밀번호를 한 번 넣으면 된다(동기화를 켜면 다른 기기에도 간다). Notion 에서 체크한 것과 사이트에서 체크한 것 중 하나라도 체크돼 있으면 끝낸 것으로 본다. 사이트에서 체크한 것이 Notion 으로 가지는 않는다.
- **하루 기준**: 하루는 새벽 4시에 바뀐다. 밤 12시를 넘겨 새벽 3시 59분까지 한 공부는 전날 공부 시간, 일지, 달력에 들어간다.
- **하루 목표 시간**: 홈의 "목표 정하기" 에 하루 공부 시간을 넣으면 오늘 얼마나 채웠는지 막대로 보인다. 어제 공부 시간도 옆에 나온다.
- **공부 시간 재기**: 홈의 "시간 재기" 나 더보기 → 공부 시간 재기. 과목을 골라 스톱워치로 재거나 25·50분 집중 타이머를 켠다. 책으로 공부할 때도 쓴다. 재는 동안 화면 맨 위에 과목과 시간이 떠 있다.
- **공부자료 목록**: 왼쪽에서 과목을 고르면 단원별로 묶인 카드가 나온다. "종류별" 을 누르면 정리 노트 / 문제·실전 / 책 문제 / 암기로 묶는다. 묶음 이름을 눌러 접고 펼친다. **내 분류**: 과목마다 분류 이름을 직접 만든다(예: 학평 / 교과서 / 시험 직전). 자료 목록의 "내 분류" → "분류 관리" 에서 분류를 만들고·이름을 바꾸고·순서를 바꾸고·지우며, 자료마다 들어갈 분류를 고른다. 자료 화면 제목 옆 "분류" 버튼으로도 넣는다.
- **수학**: 자료 없이 공부 시간만 잰다. 홈의 수학 칸이나 [더보기 → 공부 시간 재기] 에서 스톱워치를 켜고 끈다. 깜빡하고 안 쟀으면 "빈 시간 수학으로 채우기" 에 시작·끝 시각을 넣는다. 그 사이 다른 과목 기록이 없는 시간만 수학으로 들어가고, 잘못 넣은 것은 기록 목록에서 취소한다.
- **형광펜·메모**: 자료 본문 글자를 길게 눌러 고르면 화면 아래쪽에 색 버튼 띠가 뜬다 (Esc 나 ✕ 로 닫는다). (태블릿 Chrome 에서 아래에 "Google 검색" 창이 같이 뜨면 Chrome 설정 → Google 서비스 → "터치하여 검색" 을 끄면 안 뜬다.) 색 버튼 옆 "바로 칠하기" 를 켜면 그다음부터는 글자를 고르기만 해도 그 색으로 칠해지고 선택이 바로 풀려서, 브라우저 메뉴에 가리지 않는다. 끌 때는 화면 아래 "바로 칠하기 켜짐" 띠를 누른다. 칠한 곳을 누르면 메모를 달거나 지운다. [모아보기](#/marks) 에서 과목·색별로 훑는다. 단원마다 따로 쓰는 "단원 메모" 도 있다.
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
syncClockPill();
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
  notionPull();
});
// Notion 자동 업데이트: 열 때, 30분마다, 화면을 다시 켤 때 새 내용이 있는지 본다
async function notionPull() {
  const r = await NT.pull();
  if (r !== 'updated') return;
  await D.loadAll();
  const busy = document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName);
  if (!busy && !['/run', '/flash'].includes(params().path)) { render.keepScroll = true; render(); }
}
setInterval(() => { if (document.visibilityState === 'visible') notionPull(); }, 30 * 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') notionPull(); });
