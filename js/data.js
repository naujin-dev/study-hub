// 공부자료(자료 묶음)를 불러오고 검사한다.
import { kvAll, kvSet, kvDel, kvGet } from './store.js';

export const FORMAT = 'study-hub/1';

export const SUBJECTS = [
  { id: 'kor', name: '국어', color: '#C2410C' },
  { id: 'eng', name: '영어', color: '#1D4ED8' },
  { id: 'soc', name: '통합사회', color: '#047857' },
  { id: 'sci', name: '통합과학', color: '#7C3AED' },
  { id: 'his', name: '한국사', color: '#B45309' },
  { id: 'lab', name: '과학탐구실험', color: '#0E7490' },
  { id: 'jpn', name: '일본어', color: '#BE185D' },
];
export const SUBJ = Object.fromEntries(SUBJECTS.map(s => [s.id, s]));
export const TYPE_NAME = { mcq: '객관식', short: '단답형', essay: '서술형' };

// ---------- 검사 ----------
// 문제가 있으면 문장으로 된 오류 목록을 돌려준다. 빈 배열이면 통과.
export function validatePack(p, where = '자료') {
  const err = [];
  const e = m => err.push(`${where}: ${m}`);
  if (!p || typeof p !== 'object' || Array.isArray(p)) return [`${where}: 객체가 아니다.`];
  if (p.format && p.format !== FORMAT) e(`format 은 "${FORMAT}" 이어야 한다. (지금: ${p.format})`);
  if (typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(p.id)) e('id 는 영어 소문자, 숫자, - 만 쓴다. 예: "kor-01-poem"');
  if (!SUBJ[p.subject]) e(`subject 는 ${SUBJECTS.map(s => s.id).join(', ')} 중 하나여야 한다. (지금: ${p.subject})`);
  if (typeof p.title !== 'string' || !p.title.trim()) e('title 이 비어 있다.');
  if (p.unit != null && typeof p.unit !== 'string') e('unit 은 문자열이어야 한다.');
  if (p.notes != null && typeof p.notes !== 'string') e('notes 는 마크다운 문자열이어야 한다.');
  if (p.cards != null && !Array.isArray(p.cards)) e('cards 는 배열이어야 한다.');
  if (p.questions != null && !Array.isArray(p.questions)) e('questions 는 배열이어야 한다.');
  if (p.texts != null && !Array.isArray(p.texts)) e('texts 는 배열이어야 한다.');
  (Array.isArray(p.texts) ? p.texts : []).forEach((t, i) => {
    if (!t || typeof t.body !== 'string' || !t.body.trim()) e(`texts[${i}]: body(본문 글)가 비어 있다.`);
    if (t && t.title != null && typeof t.title !== 'string') e(`texts[${i}]: title 은 문자열이어야 한다.`);
  });

  const seen = new Set();
  (Array.isArray(p.cards) ? p.cards : []).forEach((c, i) => {
    const w = `cards[${i}]`;
    if (!c || typeof c.front !== 'string' || typeof c.back !== 'string') e(`${w}: front, back 이 문자열이어야 한다.`);
    if (c && c.id != null) {
      if (seen.has('c:' + c.id)) e(`${w}: id "${c.id}" 가 겹친다.`);
      seen.add('c:' + c.id);
    }
  });
  if (p.book != null && !Array.isArray(p.book)) e('book 은 배열이어야 한다.');
  // 문제와 책 문제(book)는 같은 형식으로 검사한다. id 는 둘 사이에서도 겹치면 안 된다.
  [...(Array.isArray(p.questions) ? p.questions.map((q, i) => [q, `questions[${i}]`]) : []),
   ...(Array.isArray(p.book) ? p.book.map((q, i) => [q, `book[${i}]`]) : [])].forEach(([q, w]) => {
    if (!q || typeof q !== 'object') return e(`${w}: 객체가 아니다.`);
    if (typeof q.id !== 'string' && typeof q.id !== 'number') e(`${w}: id 가 없다.`);
    else {
      if (seen.has('q:' + q.id)) e(`${w}: id "${q.id}" 가 겹친다.`);
      seen.add('q:' + q.id);
    }
    if (typeof q.question !== 'string' || !q.question.trim()) e(`${w}: question 이 비어 있다.`);
    if (q.type === 'mcq') {
      if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.some(c => typeof c !== 'string')) e(`${w}: choices 는 문자열 2개 이상인 배열이어야 한다.`);
      const ans = Array.isArray(q.answer) ? q.answer : [q.answer];
      const n = Array.isArray(q.choices) ? q.choices.length : 0;
      if (!ans.length || ans.some(a => !Number.isInteger(a) || a < 1 || a > n)) e(`${w}: answer 는 1부터 ${n || '보기 수'} 사이 번호(또는 번호 배열)여야 한다.`);
    } else if (q.type === 'short') {
      if (!Array.isArray(q.answers) || !q.answers.length || q.answers.some(a => typeof a !== 'string' || !a.trim())) e(`${w}: answers 는 정답으로 인정할 문자열 배열이어야 한다.`);
    } else if (q.type === 'essay') {
      if (typeof q.model_answer !== 'string' || !q.model_answer.trim()) e(`${w}: model_answer(모범 답안)가 없다.`);
      if (!Array.isArray(q.rubric) || !q.rubric.length || q.rubric.some(r => !r || typeof r.criterion !== 'string' || typeof r.points !== 'number')) e(`${w}: rubric 은 {criterion, points} 배열이어야 한다.`);
    } else {
      e(`${w}: type 은 mcq, short, essay 중 하나여야 한다. (지금: ${q.type})`);
    }
  });
  return err;
}

// 붙여넣은 글이나 파일에서 자료 묶음과 시험 정보를 꺼낸다.
// 받아주는 모양: 자료 하나 / 자료 배열 / { packs: [...], exam: {...} }
export function parseImport(text) {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence && !t.startsWith('{') && !t.startsWith('[')) t = fence[1].trim();
  let obj;
  try {
    obj = JSON.parse(t);
  } catch (e) {
    throw new Error('JSON 형식이 아니다. 중괄호 { 부터 끝 } 까지 빠짐없이 복사했는지 확인해 줘. (' + e.message + ')');
  }
  let packs = [], exam = null, plan = null;
  if (obj && obj.plan && Array.isArray(obj.plan.weeks)) plan = obj.plan;
  if (plan && !obj.packs && !obj.subject && !obj.texts_for) { /* 공부 계획만 */ }
  else if (obj && Array.isArray(obj.pdfs) && !obj.packs && !obj.subject) { /* PDF 만 */ }
  else if (Array.isArray(obj)) packs = obj;
  else if (obj && Array.isArray(obj.packs)) { packs = obj.packs; exam = obj.exam || null; }
  else if (obj && (obj.subject || obj.texts_for || obj.book_for)) packs = obj.texts_for || obj.book_for ? [] : [obj];
  else if (obj && obj.subjects) exam = obj;
  else throw new Error('자료(subject, title 이 있는 객체)나 { "packs": [...] } 모양이 아니다.');
  // 원문만 더하는 묶음: { "texts_for": "자료 id", "texts": [...] }
  const textPatches = packs.filter(p => p && p.texts_for);
  packs = packs.filter(p => !(p && p.texts_for));
  if (obj && obj.texts_for) textPatches.push(obj);
  // 책 문제만 더하는 묶음: { "book_for": "자료 id", "book": [...] }
  const bookPatches = packs.filter(p => p && p.book_for);
  packs = packs.filter(p => !(p && p.book_for));
  if (obj && obj.book_for) bookPatches.push(obj);
  const errors = [];
  packs.forEach((p, i) => errors.push(...validatePack(p, p && p.id ? p.id : `packs[${i}]`)));
  textPatches.forEach((t, i) => {
    const w = `원문 ${t.texts_for || i + 1}`;
    if (typeof t.texts_for !== 'string') errors.push(`${w}: texts_for 에 자료 id 를 쓴다.`);
    if (!Array.isArray(t.texts) || !t.texts.length || t.texts.some(x => !x || typeof x.body !== 'string' || !x.body.trim())) errors.push(`${w}: texts 는 body 가 있는 배열이어야 한다.`);
  });
  if (plan) {
    plan.weeks.forEach((w, i) => {
      if (!w || typeof w.title !== 'string' || !Array.isArray(w.groups)) errors.push(`공부 계획 weeks[${i}]: title, groups 가 있어야 한다.`);
    });
  }
  bookPatches.forEach((b, i) => {
    const w = `책 문제 ${b.book_for || i + 1}`;
    if (typeof b.book_for !== 'string') errors.push(`${w}: book_for 에 자료 id 를 쓴다.`);
    else errors.push(...validatePack({ id: 'x', subject: 'eng', title: 'x', book: b.book }, w).filter(m => !m.includes(': id 는') && !m.includes('title')));
  });
  // PDF 원본 묶음: { "pdfs": [ { name, title, subject, pack, data(base64) } ] } — 이 기기에만 저장한다
  const pdfs = obj && Array.isArray(obj.pdfs) ? obj.pdfs.filter(x => x && typeof x.data === 'string' && x.data.length > 100) : [];
  return { packs, exam, errors, textPatches, plan, bookPatches, pdfs };
}

// ---------- 불러오기 ----------
let state = { packs: [], byId: {}, exam: null, plan: null, loadErrors: [] };
export function db() { return state; }

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url} (${r.status})`);
  return r.json();
}

export async function loadAll() {
  const loadErrors = [];
  let repoPacks = [];
  let exam = null;
  try {
    const idx = await getJSON('data/index.json');
    const files = Array.isArray(idx.packs) ? idx.packs : [];
    const got = await Promise.all(files.map(f => getJSON('data/' + f.path).then(p => ({ ...p, _src: 'repo', _path: f.path })).catch(err => { loadErrors.push('불러오기 실패: ' + err.message); return null; })));
    repoPacks = got.filter(Boolean);
  } catch (err) {
    loadErrors.push('data/index.json 을 읽지 못했다: ' + err.message);
  }
  try { exam = await getJSON('data/exam.json'); } catch (err) { loadErrors.push('data/exam.json 을 읽지 못했다.'); }
  // 공부 계획은 저장소(공개)에 두지 않는다. 자료 가져오기로 넣으면 이 기기와 비공개 Gist 에만 저장된다.
  const plan = kvGet('notionplan', 'plan')?.plan || null;

  const local = {};
  for (const p of localPacks()) local[p.id] = p;
  const byId = {};
  for (const p of repoPacks) {
    const errs = validatePack(p, p._path || p.id);
    if (errs.length) { loadErrors.push(...errs); continue; }
    byId[p.id] = p;
  }
  for (const id in local) {
    const p = { ...local[id], _src: 'local' };
    const repo = byId[id];
    // 같은 id 면 updated 가 더 늦은 쪽을 쓴다. 같으면 내 기기 것.
    if (!repo || String(p.updated || '') >= String(repo.updated || '')) {
      if (repo) p._shadow = true;
      byId[id] = p;
    }
  }
  // 나중에 따로 가져온 책 문제(kv 'bookq')를 자료에 붙인다
  for (const b of Object.values(kvAll('bookq'))) {
    const p = byId[b.pack];
    if (!p || !Array.isArray(b.book)) continue;
    const have = new Set((p.book || []).map(q => String(q.id)));
    byId[b.pack] = { ...p, book: [...(p.book || []), ...b.book.filter(q => !have.has(String(q.id)))] };
  }
  // 자료 합치기: kv 'pmerge' (원래 자료 id → { into }) 와, 영어 책 문제만 있는 자료(eng-rp-*)를 같은 단원 자료에 저절로 붙이기
  const merges = {};
  const isBookOnly = p => p && !(p.questions || []).length && !String(p.notes || '').trim() && (p.book || []).length;
  for (const p of Object.values(byId)) {
    if (p.subject !== 'eng' || !/^eng-rp-/.test(p.id) || !isBookOnly(p)) continue;
    const m = String(p.title).match(/unit\s*0?(\d+)/i) || String(p.id).match(/-u(\d+)$/);
    if (!m) continue;
    const re = new RegExp(`(?<!\\d)0?${m[1]}(?!\\d)`);
    const hits = Object.values(byId).filter(x => x.subject === 'eng' && !/^eng-rp-/.test(x.id) && re.test(`${x.title} ${x.unit || ''}`));
    if (hits.length === 1) merges[p.id] = hits[0].id;
  }
  for (const [src, m] of Object.entries(kvAll('pmerge'))) { if (m.into) merges[src] = m.into; else delete merges[src]; }
  const alias = {};
  for (const [src, into] of Object.entries(merges)) {
    const S = byId[src], T = byId[into];
    if (!S || !T || src === into || alias[into]) continue;
    const tag = list => { const have = new Set([...(T.questions || []), ...(T.book || [])].map(x => String(x.id))); return (list || []).map(x => ({ ...x, id: have.has(String(x.id)) ? `${src}-${x.id}` : x.id, _key: x._key || `${src}::${x.id}` })); };
    byId[into] = {
      ...T,
      book: [...(T.book || []), ...tag(S.book)],
      questions: [...(T.questions || []), ...tag(S.questions)],
      cards: [...(T.cards || []), ...(S.cards || []).map((c, i) => ({ ...c, id: `${src}-${c.id ?? i}`, _key: c._key || `${src}::${c.id ?? i}` }))],
      texts: [...(T.texts || []), ...(S.texts || []).map(t => ({ ...t, id: `${src}-${t.id}` }))],
      notes: String(S.notes || '').trim() ? `${T.notes || ''}\n\n---\n\n## ${S.title}\n\n${S.notes}` : T.notes,
      order: T.order ?? S.order,
      _mergedFrom: [...(T._mergedFrom || []), { id: src, title: S.title, auto: !kvGet('pmerge', src) }],
    };
    alias[src] = into;
    delete byId[src];
  }
  // 사이트에서 바꾼 자료 이름(kv 'ptitle'). 원래 이름은 _title 에 남긴다
  for (const [id, t] of Object.entries(kvAll('ptitle'))) {
    const p = byId[id];
    if (p && typeof t.title === 'string' && t.title.trim()) byId[id] = { ...p, title: t.title.trim(), _title: p.title };
  }
  // 사이트에서 정한 과목별 자료 순서(kv 'porder'). 목록에 없는 자료는 그 뒤에 원래 순서로
  const rank = {};
  for (const o of Object.values(kvAll('porder'))) (o.ids || []).forEach((id, i) => { rank[id] = i; });
  const packs = Object.values(byId).filter(p => !alias[p.id]).sort((a, b) => {
    if (a.subject === b.subject) {
      const ra = rank[a.id] ?? 1e9, rb = rank[b.id] ?? 1e9;
      if (ra !== rb) return ra - rb;
    }
    return packOrder(a, b);
  });
  // 합쳐진 자료 id 로 찾아도 합친 자료가 나오게 (예전 기록의 키가 원래 자료 id 로 시작한다)
  for (const [src, into] of Object.entries(alias)) byId[src] = byId[into];
  state = { packs, byId, alias, exam: mergeExam(exam), plan, loadErrors };
  return state;
}

function packOrder(a, b) {
  const sa = SUBJECTS.findIndex(s => s.id === a.subject), sb = SUBJECTS.findIndex(s => s.id === b.subject);
  if (sa !== sb) return sa - sb;
  const oa = a.order ?? 999, ob = b.order ?? 999;
  if (oa !== ob) return oa - ob;
  return String(a.title).localeCompare(String(b.title), 'ko');
}

// 저장소의 시험 정보 위에 내가 이 기기에서 고친 날짜/범위를 덮어쓴다.
function mergeExam(repo) {
  const base = repo || { title: '2회고사', days: [], subjects: {} };
  const mine = kvAll('exam');
  const subjects = {};
  for (const s of SUBJECTS) {
    const r = (base.subjects && base.subjects[s.id]) || {};
    const m = mine[s.id] || {};
    subjects[s.id] = {
      date: m.date !== undefined ? m.date : (r.date || null),
      range: m.range !== undefined ? m.range : (r.range || ''),
      repoDate: r.date || null,
      repoRange: r.range || '',
    };
  }
  return { ...base, subjects };
}

export function saveLocalPacks(packs) {
  const now = new Date().toISOString();
  for (const p of packs) {
    const copy = { ...p };
    delete copy._src; delete copy._path; delete copy._shadow;
    if (!copy.updated) copy.updated = now;
    kvSet('packs', copy.id, { pack: copy });
  }
  return true;
}
export function localPacks() {
  return Object.values(kvAll('packs')).map(v => v.pack).filter(Boolean);
}
export function deleteLocalPack(id) {
  kvDel('packs', id);
}
export function saveExamLocal(subjects) {
  const mine = kvAll('exam');
  for (const id in subjects) {
    const { u, ...rest } = mine[id] || {};
    kvSet('exam', id, { ...rest, ...subjects[id] });
  }
}
export function saveBook(packId, book) {
  const cur = kvGet('bookq', packId);
  const have = new Map((cur?.book || []).map(q => [String(q.id), q]));
  for (const q of book) have.set(String(q.id), q);
  kvSet('bookq', packId, { pack: packId, book: [...have.values()] });
}
export function renamePack(id, title) {
  const t = String(title || '').trim();
  if (t) kvSet('ptitle', id, { title: t }); else kvDel('ptitle', id);
}
// 과목 하나의 자료 순서를 통째로 저장한다. ids 가 비면 원래 순서로
export function savePackOrder(subject, ids) {
  if (ids && ids.length) kvSet('porder', subject, { ids }); else kvDel('porder', subject);
}
// 자료 src 를 into 에 합친다. into 가 null 이면 따로 둔다(저절로 합치기도 막는다)
export function mergePack(src, into) { kvSet('pmerge', src, { into: into || null }); }
export function unmergePack(src) { kvSet('pmerge', src, { into: null }); }
export function savePlan(plan) {
  kvSet('notionplan', 'plan', { plan });
}
export function clearPlan() {
  kvDel('notionplan', 'plan');
}
export function clearExamLocal() {
  for (const id in kvAll('exam')) kvDel('exam', id);
}

// ---------- 편의 함수 ----------
// 다른 자료에서 합쳐 온 문제·카드는 원래 키(_key)를 써서 푼 기록이 이어진다
export const qkey = (pack, q) => q._key || `${pack.id}::${q.id}`;
export const ckey = (pack, c, i) => c._key || `${pack.id}::${c.id ?? i}`;

export function allQuestions(filter = {}) {
  const out = [];
  for (const p of state.packs) {
    if (filter.subject && filter.subject.length && !filter.subject.includes(p.subject)) continue;
    if (filter.packs && filter.packs.length && !filter.packs.includes(p.id)) continue;
    for (const q of p.questions || []) {
      if (filter.types && filter.types.length && !filter.types.includes(q.type)) continue;
      out.push({ pack: p, q, key: qkey(p, q) });
    }
    if (filter.book === false) continue;
    for (const q of p.book || []) {
      if (filter.types && filter.types.length && !filter.types.includes(q.type)) continue;
      out.push({ pack: p, q, key: qkey(p, q), book: true });
    }
  }
  return out;
}
export function allCards(filter = {}) {
  const out = [];
  for (const p of state.packs) {
    if (filter.subject && filter.subject.length && !filter.subject.includes(p.subject)) continue;
    if (filter.packs && filter.packs.length && !filter.packs.includes(p.id)) continue;
    (p.cards || []).forEach((c, i) => out.push({ pack: p, c, key: ckey(p, c, i) }));
  }
  return out;
}
export function essayMax(q) {
  if (typeof q.points === 'number') return q.points;
  return (q.rubric || []).reduce((s, r) => s + (r.points || 0), 0);
}
