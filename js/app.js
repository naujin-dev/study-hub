import * as S from './store.js';
import * as D from './data.js';
import * as AI from './ai.js';

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

function md(text) {
  if (!text) return '';
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
  '/help': viewHelp,
};
const navOf = { '/': 'home', '/study': 'study', '/pack': 'study', '/quiz': 'quiz', '/run': 'quiz', '/wrong': 'wrong' };

function render() {
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
  const read = S.load('read', {});
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
function streakDays() {
  const log = S.load('log', {});
  let d = S.today(), n = 0;
  if (!log[d] || !(log[d].q || log[d].c || log[d].min)) d = S.addDays(d, -1);
  while (log[d] && (log[d].q || log[d].c || log[d].min)) { n++; d = S.addDays(d, -1); }
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
  const plan = S.load('plan', []).filter(p => p.date === t);
  const log = S.load('log', {})[t] || { q: 0, ok: 0, c: 0, min: 0 };

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
    <p>공부자료를 만드는 Claude 에게 <a href="${REPO_URL}/blob/main/PROMPT.md" target="_blank" rel="noopener">PROMPT.md</a> 의 프롬프트를 보내서 자료를 받은 뒤,</p>
    <ul><li>채팅 Claude 가 준 JSON 은 <a href="#/settings">설정 → 자료 가져오기</a> 에 붙여넣거나</li><li>Claude Code 에게 저장소에 바로 올리게 하면 된다.</li></ul></section>` : ''}

  <section class="grid" style="margin-bottom:14px">
    <a class="stat" href="#/run?src=due" style="text-decoration:none;color:inherit"><b>${due.length}</b><span>오늘 복습할 문제</span></a>
    <a class="stat" href="#/wrong" style="text-decoration:none;color:inherit"><b style="color:var(--bad)">${wrong.length}</b><span>오답노트</span></a>
    <div class="stat"><b>${log.q}</b><span>오늘 푼 문제 (${pct(log.ok, log.q)}%)</span></div>
    <div class="stat"><b>${streakDays()}</b><span>연속 공부한 날</span></div>
  </section>

  <div class="row" style="margin-bottom:6px">
    ${due.length ? `<a class="btn pri" href="#/run?src=due">복습 ${due.length}문제 풀기</a>` : ''}
    ${wrong.length ? `<a class="btn" href="#/run?src=wrong">오답 다시 풀기</a>` : ''}
    <a class="btn" href="#/quiz">문제 고르기</a>
    <a class="btn" href="#/cards">암기카드</a>
  </div>

  ${plan.length ? `<div class="sec-title"><h2>오늘 계획</h2><a class="small" href="#/plan">전체 보기</a></div>
  <section class="card flat"><ul class="list">${plan.map(p => `<li><label class="item"><input type="checkbox" data-plan="${p.id}"${p.done ? ' checked' : ''}><span class="grow"${p.done ? ' style="text-decoration:line-through;color:var(--ink3)"' : ''}>${p.subject ? subjDot(p.subject) + ' ' : ''}${esc(p.text)}</span></label></li>`).join('')}</ul></section>` : ''}

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
  $$('[data-plan]').forEach(cb => cb.addEventListener('change', () => {
    const all = S.load('plan', []);
    const it = all.find(p => p.id === cb.dataset.plan);
    if (it) { it.done = cb.checked; S.save('plan', all); render.keepScroll = true; render(); }
  }));
}

// ================= 자료 목록 =================
function viewStudy() {
  const { q } = params();
  const sel = q.get('s') || '';
  const term = (q.get('q') || '').trim();
  const read = S.load('read', {});
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
function viewPack() {
  const { q } = params();
  const p = D.db().byId[q.get('id')];
  if (!p) { main.innerHTML = '<p>자료를 찾지 못했다. <a href="#/study">목록으로</a></p>'; return; }
  const read = S.load('read', {});
  const prog = S.getProgress();
  const qs = p.questions || [];
  const cnt = t => qs.filter(x => x.type === t).length;
  const tried = qs.filter(x => prog[D.qkey(p, x)]?.n).length;
  const ok = qs.reduce((s, x) => s + (prog[D.qkey(p, x)]?.ok || 0), 0);
  const n = qs.reduce((s, x) => s + (prog[D.qkey(p, x)]?.n || 0), 0);
  const hist = chatHistory[p.id] || [];
  const hl = q.get('hl');

  main.innerHTML = `
  <p class="small"><a href="#/study?s=${p.subject}">← ${subjName(p.subject)}</a></p>
  <h1>${esc(p.title)}</h1>
  <div class="row small muted" style="margin-bottom:10px">${subjDot(p.subject)} ${subjName(p.subject)}${p.unit ? ' · ' + esc(p.unit) : ''}${p.updated ? ' · ' + esc(String(p.updated).slice(0, 10)) : ''}${p._src === 'local' ? ' <span class="tag vio">내 기기에 가져온 자료</span>' : ''}</div>
  ${p.summary ? `<p class="note info">${esc(p.summary)}</p>` : ''}
  <div class="row noprint" style="margin:12px 0">
    ${qs.length ? `<a class="btn pri" href="#/run?pack=${encodeURIComponent(p.id)}">문제 ${qs.length}개 풀기</a>` : ''}
    ${(p.cards || []).length ? `<a class="btn" href="#/flash?pack=${encodeURIComponent(p.id)}">암기카드 ${p.cards.length}장</a>` : ''}
    <a class="btn" href="#/gen?pack=${encodeURIComponent(p.id)}">AI 문제 더 만들기</a>
    <button class="btn ghost" id="readBtn">${read[p.id] ? '읽음 ✓' : '다 읽음'}</button>
    <button class="btn ghost" id="printBtn">인쇄</button>
  </div>
  ${qs.length ? `<p class="small muted">객관식 ${cnt('mcq')} · 단답형 ${cnt('short')} · 서술형 ${cnt('essay')} · 푼 문제 ${tried}/${qs.length} · 정답률 ${n ? pct(ok, n) + '%' : '-'}</p>` : ''}
  <div class="pack-layout"><div class="pack-main">
  <article class="card notes" id="notes">${p.notes ? md(p.notes) : '<p class="muted">본문이 없는 자료다.</p>'}</article>
  ${(p.cards || []).length ? `<details class="card flat"><summary>암기 항목 ${p.cards.length}개 한눈에 보기</summary><table class="crit">${p.cards.map(c => `<tr><td><b>${esc(c.front)}</b></td><td>${esc(c.back)}</td></tr>`).join('')}</table></details>` : ''}
  </div>
  <aside class="pack-side"><section class="card noprint">
    <h2>이 자료에 대해 묻기</h2>
    ${AI.hasKey() ? '' : '<p class="note">설정에서 API 키를 넣으면 쓸 수 있다.</p>'}
    <div id="chat">${hist.map(h => `<p><b>나:</b> ${esc(h.q)}</p><div class="notes" style="margin-bottom:12px">${md(h.a)}</div>`).join('')}</div>
    <form id="askf"><textarea name="q" rows="3" placeholder="예: 이 시에서 화자의 태도가 바뀌는 부분이 어디야?" style="min-height:80px"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn pri"${AI.hasKey() ? '' : ' disabled'}>묻기</button>${hist.length ? '<button type="button" class="btn ghost sm" id="clearChat">대화 지우기</button>' : ''}</div></form>
  </section></aside></div>
  `;
  if (hl) highlight($('#notes'), hl);
  $('#readBtn').addEventListener('click', () => {
    const r = S.load('read', {});
    if (r[p.id]) delete r[p.id]; else r[p.id] = S.today();
    S.save('read', r);
    render.keepScroll = true; render();
  });
  $('#printBtn').addEventListener('click', () => window.print());
  $('#clearChat')?.addEventListener('click', () => { chatHistory[p.id] = []; render.keepScroll = true; render(); });
  $('#askf').addEventListener('submit', async e => {
    e.preventDefault();
    const text = e.target.q.value.trim();
    if (!text) return;
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> 생각 중';
    try {
      const a = await AI.askAboutPack(p, text, chatHistory[p.id] || []);
      chatHistory[p.id] = [...(chatHistory[p.id] || []), { q: text, a }];
      render.keepScroll = true; render();
    } catch (err) {
      toast(err.message, 4000);
      btn.disabled = false; btn.textContent = '묻기';
    }
  });
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

function drawQuestion() {
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
    acts.innerHTML = `<button class="btn pri" id="checkBtn">채점</button><button class="btn ghost" id="skipBtn">모르겠다</button>`;
  } else {
    acts.innerHTML = `${session.viewing ? `<a class="btn" href="#/run" id="toSum">결과 목록</a>` : ''}<button class="btn pri" id="next">${last ? '결과 보기' : '다음'}</button>`;
  }
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
    const r = { result: 'wrong', skipped: true };
    session.results[session.i] = r;
    S.recordAnswer(key, 'wrong', '', null);
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
  session.results[i] = r;
  if (r.result) S.recordAnswer(key, r.result, a, r.fb || (r.ai ? { kind: 'short', reason: r.ai } : null));
  return r;
}

function resultHtml(it, r) {
  const { q } = it;
  const a = session ? session.answers[session.items.indexOf(it)] : '';
  const title = { ok: '맞았다', part: '부분 점수', wrong: r.skipped ? '모르는 문제로 넘김' : '틀렸다' }[r.result] || '스스로 채점';
  let h = `<div class="result ${r.result || ''}"><h3>${title}</h3>`;
  if (q.type === 'mcq') {
    const right = Array.isArray(q.answer) ? q.answer : [q.answer];
    h += `<p>정답: ${right.map(n => '①②③④⑤⑥'[n - 1] || n).join(', ')}</p>`;
  }
  if (q.type === 'short') {
    h += `<p>정답: <b>${q.answers.map(esc).join(' / ')}</b></p>`;
    if (r.ai) h += `<p class="small">AI: ${esc(r.ai)}</p>`;
    if (r.aiError) h += `<p class="small">AI 확인 실패: ${esc(r.aiError)}</p>`;
    if (r.result !== 'ok' && !r.skipped) h += `<button class="btn sm" data-override>내 답도 맞다 (맞음으로 고치기)</button>`;
  }
  if (q.type === 'essay') {
    if (r.fb && r.fb.criteria) {
      h += `<p class="mono" style="font-size:1.2rem;margin:4px 0"><b>${r.fb.score}</b> / ${r.fb.max}점</p>`;
      if (r.fb.criteria.length) h += `<table class="crit">${r.fb.criteria.map(c => `<tr><td>${esc(c.criterion)}<br><span class="small muted">${esc(c.comment)}</span></td><td class="pt">${c.earned}/${c.max}</td></tr>`).join('')}</table>`;
      if (r.fb.good) h += `<p><b>맞게 쓴 것</b> ${esc(r.fb.good)}</p>`;
      if (r.fb.missing) h += `<p><b>빠지거나 틀린 것</b> ${esc(r.fb.missing)}</p>`;
      if (r.fb.improved) h += `<details><summary>내 답을 고친 만점 답안</summary><p style="white-space:pre-wrap">${esc(r.fb.improved)}</p></details>`;
    }
    if (r.selfGrade) {
      h += `${r.aiError ? `<p class="small">AI 채점 실패: ${esc(r.aiError)}</p>` : '<p class="small">API 키가 없어서 스스로 채점한다. 모범 답안을 보고 맞힌 기준을 고른다.</p>'}
      <form id="selfForm">${q.rubric.map((c, i) => `<label class="item" style="display:flex;gap:8px;padding:6px 0"><input type="checkbox" name="c" value="${i}"><span class="grow">${esc(c.criterion)}</span><span class="mono small">${c.points}점</span></label>`).join('')}
      <div class="row" style="margin-top:6px"><button class="btn sm pri">이만큼 맞혔다</button>${AI.hasKey() ? '<button type="button" class="btn sm" id="retryAi">AI 채점 다시</button>' : ''}</div></form>`;
    }
    h += `<details${r.selfGrade ? ' open' : ''}><summary>모범 답안</summary><p style="white-space:pre-wrap">${esc(q.model_answer)}</p></details>`;
    if (!r.selfGrade) h += `<details><summary>채점 기준</summary><ul>${q.rubric.map(c => `<li>${esc(c.criterion)} (${c.points}점)</li>`).join('')}</ul></details>`;
  }
  if (q.explanation) h += `<p style="margin-top:8px"><b>해설</b> ${esc(q.explanation)}</p>`;
  if (q.type !== 'mcq' && a && session.mode === 'exam') h += `<details><summary>내가 쓴 답</summary><p style="white-space:pre-wrap">${esc(a)}</p></details>`;
  h += '</div>';
  return h;
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
    S.recordAnswer(it.key, result, session.answers[i], fb);
    render.keepScroll = true; drawQuestion();
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
function viewWrong() {
  const { q } = params();
  const sel = q.get('s') || '';
  const prog = S.getProgress();
  const items = wrongItems().filter(x => !sel || x.pack.subject === sel);
  const subjects = SUBJECTS.filter(s => wrongItems().some(x => x.pack.subject === s.id));
  main.innerHTML = `
  <div class="row between"><h1 style="margin:0">오답노트</h1>${items.length ? `<button class="btn pri sm" id="retry">${items.length}문제 다시 풀기</button>` : ''}</div>
  <p class="small muted">틀리거나 부분 점수를 받은 문제가 모인다. 두 번 연속 맞히면 빠진다.</p>
  ${subjects.length ? chipGroup('ws', [{ value: '', label: '전체' }, ...subjects.map(s => ({ value: s.id, label: s.name, dot: true }))], [sel], false) : ''}
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
      <div class="row"><button class="btn sm" data-one="${esc(x.key)}">이 문제 풀기</button><button class="btn sm ghost" data-done="${esc(x.key)}">이제 안다 (빼기)</button></div>
    </details>`;
  }).join('') || '<p class="muted">오답이 없다.</p>'}</div>`;
  $$('input[name="ws"]').forEach(r => r.addEventListener('change', () => { location.hash = '#/wrong' + (r.value ? '?s=' + r.value : ''); }));
  $('#retry')?.addEventListener('click', () => startSession(shuffle(items), 'practice'));
  $$('[data-one]').forEach(b => b.addEventListener('click', () => startSession(items.filter(x => x.key === b.dataset.one), 'practice')));
  $$('[data-done]').forEach(b => b.addEventListener('click', () => { S.setFlag(b.dataset.done, 'wrong', false); toast('오답노트에서 뺐다.'); render.keepScroll = true; render(); }));
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
  const flip = () => { flash.back = !flash.back; viewFlash(); };
  $('#fc').addEventListener('click', flip);
  $('#fc').addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
  const next = knew => { S.recordCard(x.key, knew); if (knew) flash.knew++; else flash.list.push(x); flash.i++; flash.back = false; viewFlash(); };
  $('#yes')?.addEventListener('click', () => next(true));
  $('#no')?.addEventListener('click', () => next(false));
}

// ================= AI 문제 만들기 =================
let genResult = null;
function viewGen() {
  const { q } = params();
  const packs = D.db().packs.filter(p => p.notes && !p.id.endsWith('-ai'));
  const id = q.get('pack') || '';
  const p = D.db().byId[id];
  main.innerHTML = `
  <h1>AI 문제 만들기</h1>
  <p class="small muted">공부자료 본문을 보고 Claude 가 새 문제를 만든다. 만든 문제는 이 기기에 "(AI 문제)" 자료로 저장된다.</p>
  ${AI.hasKey() ? '' : '<p class="note">설정에서 API 키를 먼저 넣는다.</p>'}
  <form id="gf" class="card">
    <label class="field"><span>자료</span><select name="pack">${packs.map(x => `<option value="${esc(x.id)}"${x.id === id ? ' selected' : ''}>${subjName(x.subject)} · ${esc(x.title)}</option>`).join('')}</select></label>
    <h3>유형</h3>${chipGroup('types', Object.entries(TYPE_NAME).map(([v, l]) => ({ value: v, label: l })), ['mcq', 'short', 'essay'])}
    <div class="grid" style="margin-top:10px">
      <label class="field"><span>개수</span><select name="count">${[3, 5, 10, 15].map(n => `<option${n === 5 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field"><span>난이도</span><select name="diff"><option value="0">고르게</option><option value="1">쉬움</option><option value="2">보통</option><option value="3">어려움</option></select></label>
    </div>
    <label class="field"><span>특히 이 부분 (선택)</span><input type="text" name="focus" placeholder="예: 3연의 표현법, 관계대명사 what"></label>
    <button class="btn pri block"${AI.hasKey() && packs.length ? '' : ' disabled'}>만들기</button>
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
      const ids = new Set(qs.map(x => x.id));
      genResult = null;
      startSession(D.allQuestions({ packs: [pk.id] }).filter(x => ids.has(x.q.id)), 'practice');
    });
    $('#saveOnly').addEventListener('click', async () => { await saveIt(); genResult = null; toast('저장했다.'); render(); });
  };
  showResult();
  $('#gf').addEventListener('submit', async e => {
    e.preventDefault();
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
  const plan = S.load('plan', []).sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
  const t = S.today();
  const byDate = {};
  for (const p of plan) (byDate[p.date] = byDate[p.date] || []).push(p);
  main.innerHTML = `
  <h1>시험 일정과 계획</h1>
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
    <h2>공부 계획</h2>
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
  $('#resetExam').addEventListener('click', () => { if (!confirm('이 기기에서 고친 날짜와 범위를 지울까?')) return; S.remove('examLocal'); D.loadAll().then(render); });
  $('#pf').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const all = S.load('plan', []);
    all.push({ id: Date.now().toString(36), date: f.date.value, subject: f.subject.value, text: f.text.value.trim(), done: false });
    S.save('plan', all);
    render.keepScroll = true; render();
  });
  $$('[data-pc]').forEach(cb => cb.addEventListener('change', () => { const all = S.load('plan', []); const it = all.find(p => p.id === cb.dataset.pc); if (it) it.done = cb.checked; S.save('plan', all); render.keepScroll = true; render(); }));
  $$('[data-pd]').forEach(b => b.addEventListener('click', () => { S.save('plan', S.load('plan', []).filter(p => p.id !== b.dataset.pd)); render.keepScroll = true; render(); }));
  $('#clearDone')?.addEventListener('click', () => { S.save('plan', S.load('plan', []).filter(p => !p.done)); render.keepScroll = true; render(); });
}

// ================= 기록·타이머 =================
function viewStats() {
  const log = S.load('log', {});
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(S.addDays(S.today(), -i));
  const maxQ = Math.max(1, ...days.map(d => log[d]?.q || 0));
  const st = subjectStats();
  const units = unitStats().filter(u => u.n).sort((a, b) => a.rate - b.rate);
  const total = Object.values(log).reduce((a, d) => ({ q: a.q + (d.q || 0), ok: a.ok + (d.ok || 0), min: a.min + (d.min || 0), c: a.c + (d.c || 0) }), { q: 0, ok: 0, min: 0, c: 0 });
  const tm = S.load('timer', null);
  main.innerHTML = `
  <h1>공부 기록</h1>
  <section class="grid" style="margin-bottom:14px">
    <div class="stat"><b>${total.q}</b><span>푼 문제</span></div>
    <div class="stat"><b>${pct(total.ok, total.q)}%</b><span>전체 정답률</span></div>
    <div class="stat"><b>${total.c}</b><span>넘긴 카드</span></div>
    <div class="stat"><b>${Math.floor(total.min / 60)}시간 ${total.min % 60}분</b><span>집중 타이머</span></div>
  </section>

  <section class="card">
    <h2>집중 타이머</h2>
    <p class="timer" id="ft" style="font-size:2.2rem;margin:6px 0">${tm ? '' : '25:00'}</p>
    <div class="row">${tm ? '<button class="btn bad" id="tStop">멈추기</button>' : [25, 50].map(m => `<button class="btn${m === 25 ? ' pri' : ''}" data-tm="${m}">${m}분</button>`).join('')}</div>
    <p class="small muted">끝까지 채운 시간만 기록된다. 다른 화면으로 가도 계속 돈다.</p>
  </section>

  <section class="card">
    <h2>최근 2주</h2>
    <div class="bars">${days.map(d => {
      const v = log[d] || {};
      return `<div class="b" title="${d}: ${v.q || 0}문제, 맞음 ${v.ok || 0}"><span class="small mono">${v.q || ''}</span><i style="height:${((v.q || 0) / maxQ) * 100}%"></i><small>${Number(d.slice(8))}</small></div>`;
    }).join('')}</div>
  </section>

  <section class="card">
    <h2>과목별</h2>
    <table class="crit">${SUBJECTS.map(s => { const o = st[s.id]; return `<tr><td>${subjDot(s.id)} ${s.name}</td><td class="pt">${o.tried}/${o.total}문제</td><td class="pt">${o.n ? pct(o.ok, o.n) + '%' : '-'}</td></tr>`; }).join('')}</table>
  </section>

  ${units.length ? `<section class="card"><h2>단원별 정답률</h2><table class="crit">${units.map(u => `<tr><td><a href="#/pack?id=${encodeURIComponent(u.pack.id)}">${esc(u.pack.title)}</a><br><span class="small muted">${subjName(u.pack.subject)} · ${u.tried}/${u.total}문제</span></td><td class="pt"><span class="tag ${u.rate >= 0.8 ? 'ok' : u.rate >= 0.5 ? 'warn' : 'bad'}">${Math.round(u.rate * 100)}%</span></td></tr>`).join('')}</table></section>` : ''}`;
  $$('[data-tm]').forEach(b => b.addEventListener('click', () => { S.save('timer', { start: Date.now(), len: Number(b.dataset.tm) }); startTimerLoop(); render.keepScroll = true; render(); }));
  $('#tStop')?.addEventListener('click', () => {
    const t = S.load('timer', null);
    if (t) { const m = Math.floor((Date.now() - t.start) / 60000); if (m > 0) S.logDay({ min: m }); }
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
      S.logDay({ min: t.len });
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

// ================= 설정·가져오기 =================
let pendingImport = null;
function viewSettings() {
  const s = AI.settings();
  const local = S.load('packs', {});
  const localList = Object.values(local);
  main.innerHTML = `
  <h1>설정</h1>
  <section class="card" id="import">
    <h2>자료 가져오기</h2>
    <p class="small muted">공부자료 Claude 가 준 JSON 을 통째로 붙여넣거나 .json 파일을 고른다. 가져온 자료는 이 기기에만 저장된다. 다른 기기에서도 보려면 저장소 data/packs/ 에 올린다.</p>
    <textarea id="impText" placeholder='{ "format": "study-hub/1", "id": "...", ... }' style="min-height:140px;font-family:var(--mono);font-size:.85rem"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn" id="impCheck">검사</button><label class="btn ghost">파일 고르기<input type="file" id="impFile" accept=".json,application/json,text/plain" multiple hidden></label></div>
    <div id="impOut"></div>
  </section>

  ${localList.length ? `<section class="card"><h2>이 기기에 가져온 자료 ${localList.length}개</h2><ul class="list">${localList.map(p => `<li class="item">${subjDot(p.subject)}<span class="grow">${esc(p.title)}<br><span class="small muted">${esc(p.id)} · 문제 ${(p.questions || []).length} · 카드 ${(p.cards || []).length}</span></span><button class="btn sm ghost" data-copy="${esc(p.id)}">JSON 복사</button><button class="btn sm bad" data-del="${esc(p.id)}">지우기</button></li>`).join('')}</ul>
  <p class="small muted">"JSON 복사" 한 내용을 저장소 data/packs/과목/ 에 파일로 올리면 모든 기기에서 보인다.</p></section>` : ''}

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
    <p class="small muted">푼 기록, 오답노트, 계획, 가져온 자료는 이 기기에만 있다. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 백업 파일을 받아 둔다. (API 키는 빼고 저장된다)</p>
    <div class="row"><button class="btn" id="exp">백업 파일 받기</button><label class="btn">백업 불러오기<input type="file" id="impBk" accept=".json" hidden></label><button class="btn bad ghost" id="reset">기록 초기화</button></div>
  </section>`;

  // 가져오기
  const out = $('#impOut');
  const check = text => {
    try {
      const r = D.parseImport(text);
      const bad = new Set(r.errors.map(m => m.split(':')[0]));
      const okPacks = r.packs.filter((p, i) => !bad.has(p && p.id ? p.id : `packs[${i}]`));
      pendingImport = { packs: okPacks, exam: r.exam };
      out.innerHTML = `<div class="${r.errors.length ? 'note' : 'note info'}" style="margin-top:10px">
        <p>자료 ${r.packs.length}개 중 ${okPacks.length}개 가져올 수 있다.${r.exam ? ' 시험 정보도 들어 있다.' : ''}</p>
        ${okPacks.map(p => `<div class="small">${subjDot(p.subject)} ${esc(p.title)} · 문제 ${(p.questions || []).length} · 카드 ${(p.cards || []).length}${D.db().byId[p.id] ? ' <span class="tag warn">같은 id 덮어씀</span>' : ''}</div>`).join('')}
        ${r.errors.length ? `<details open><summary>고칠 것 ${r.errors.length}개</summary><ul class="small">${r.errors.slice(0, 30).map(m => `<li>${esc(m)}</li>`).join('')}</ul><p class="small">이 목록을 공부자료 Claude 에게 보내고 고쳐 달라고 하면 된다.</p></details>` : ''}
        ${okPacks.length || r.exam ? '<button class="btn pri" id="impGo" style="margin-top:8px">가져오기</button>' : ''}
      </div>`;
      $('#impGo')?.addEventListener('click', async () => {
        if (pendingImport.packs.length) D.saveLocalPacks(pendingImport.packs);
        if (pendingImport.exam && pendingImport.exam.subjects) {
          const sub = {};
          for (const id in pendingImport.exam.subjects) if (SUBJ[id]) { const v = pendingImport.exam.subjects[id]; sub[id] = {}; if ('date' in v) sub[id].date = v.date; if ('range' in v) sub[id].range = v.range; }
          D.saveExamLocal(sub);
        }
        await D.loadAll();
        toast(`${pendingImport.packs.length}개 가져왔다.`);
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
    const p = S.load('packs', {})[b.dataset.copy];
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

  // 백업
  $('#exp').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S.exportAll(false), null, 1)], { type: 'application/json' });
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
      toast('불러왔다. 새로고침한다.');
      setTimeout(() => location.reload(), 800);
    } catch (err) { toast(err.message, 4000); }
  });
  $('#reset').addEventListener('click', () => {
    if (!confirm('푼 기록, 오답노트, 카드 기록, 하루 기록을 모두 지울까? 자료와 계획, API 키는 남는다.')) return;
    S.resetProgress(); toast('지웠다.'); render();
  });
}

// ================= 더보기, 도움말 =================
function viewMore() {
  const links = [
    ['#/cards', '암기카드', '용어, 단어, 연도를 카드로 외운다'],
    ['#/gen', 'AI 문제 만들기', '자료를 보고 새 문제를 만든다'],
    ['#/plan', '시험 일정과 계획', '과목별 날짜·범위, 할 일 목록'],
    ['#/stats', '공부 기록과 타이머', '정답률, 약한 단원, 집중 타이머'],
    ['#/settings', '설정과 자료 가져오기', 'API 키, JSON 붙여넣기, 백업'],
    ['#/help', '사용법', '자료를 넣는 방법과 기능 설명'],
  ];
  main.innerHTML = `<h1>더보기</h1><section class="card flat"><ul class="list">${links.map(([h, t, d]) => `<li><a class="item" href="${h}"><span class="grow"><b>${t}</b><br><span class="small muted">${d}</span></span>›</a></li>`).join('')}</ul></section>`;
}

function viewHelp() {
  main.innerHTML = `<h1>사용법</h1>
  <article class="card notes">${md(`
## 자료 넣는 방법 두 가지

1. **채팅 Claude 에게 받기**: [PROMPT.md](${REPO_URL}/blob/main/PROMPT.md) 의 "채팅용 프롬프트" 를 공부자료 Claude 에게 보낸다. Claude 가 준 JSON 을 [설정 → 자료 가져오기](#/settings) 에 붙여넣고 "검사" → "가져오기". 이 기기에만 저장된다.
2. **Claude Code 가 저장소에 올리기**: PROMPT.md 의 "Claude Code 용 프롬프트" 를 쓴다. \`data/packs/\` 에 파일이 올라가면 모든 기기에서 보인다.

## 채점

- **객관식**: 바로 채점한다.
- **단답형**: 정답 목록과 띄어쓰기·문장부호를 빼고 비교한다. 다르면 API 키가 있을 때 AI 가 뜻이 같은지 본다. 키가 없으면 "내 답도 맞다" 로 고칠 수 있다.
- **서술형**: API 키가 있으면 AI 가 채점 기준마다 점수를 매기고 빠진 점과 고친 답안을 준다. 키가 없으면 모범 답안을 보고 스스로 채점한다.

## 복습 순서

맞힌 문제는 1·2·4·7·14일 뒤에 다시 나온다. 틀리면 다음 날 다시 나온다. 홈의 "오늘 복습할 문제" 가 그날 풀 문제다.
오답노트는 틀리거나 부분 점수를 받은 문제를 모은다. 두 번 연속 맞히거나 "이제 안다" 를 누르면 빠진다.

## 실전 모드

문제 풀기에서 방식을 "실전" 으로 고르면 제한 시간 안에 다 풀고 한꺼번에 채점한다. 시험 전 주에 과목별로 한 번씩 해 본다.

## 기록은 이 기기에만

푼 기록, 오답, 계획, 가져온 자료는 지금 쓰는 브라우저에만 저장된다. 휴대폰과 컴퓨터를 같이 쓰면 [설정 → 백업](#/settings) 으로 파일을 옮긴다.
`)}</article>`;
}

// ---------- 시작 ----------
applyTheme();
D.loadAll().then(() => {
  render();
  startTimerLoop();
});
