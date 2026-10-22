// 공부자료(자료 묶음)를 불러오고 검사한다.
import { kvAll, kvSet, kvDel } from './store.js';

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

  const seen = new Set();
  (Array.isArray(p.cards) ? p.cards : []).forEach((c, i) => {
    const w = `cards[${i}]`;
    if (!c || typeof c.front !== 'string' || typeof c.back !== 'string') e(`${w}: front, back 이 문자열이어야 한다.`);
    if (c && c.id != null) {
      if (seen.has('c:' + c.id)) e(`${w}: id "${c.id}" 가 겹친다.`);
      seen.add('c:' + c.id);
    }
  });
  (Array.isArray(p.questions) ? p.questions : []).forEach((q, i) => {
    const w = `questions[${i}]`;
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
  let packs = [], exam = null;
  if (Array.isArray(obj)) packs = obj;
  else if (obj && Array.isArray(obj.packs)) { packs = obj.packs; exam = obj.exam || null; }
  else if (obj && obj.subject) packs = [obj];
  else if (obj && obj.subjects) exam = obj;
  else throw new Error('자료(subject, title 이 있는 객체)나 { "packs": [...] } 모양이 아니다.');
  const errors = [];
  packs.forEach((p, i) => errors.push(...validatePack(p, p && p.id ? p.id : `packs[${i}]`)));
  return { packs, exam, errors };
}

// ---------- 불러오기 ----------
let state = { packs: [], byId: {}, exam: null, loadErrors: [] };
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
  const packs = Object.values(byId).sort(packOrder);
  state = { packs, byId, exam: mergeExam(exam), loadErrors };
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
export function clearExamLocal() {
  for (const id in kvAll('exam')) kvDel('exam', id);
}

// ---------- 편의 함수 ----------
export const qkey = (pack, q) => `${pack.id}::${q.id}`;
export const ckey = (pack, c, i) => `${pack.id}::${c.id ?? i}`;

export function allQuestions(filter = {}) {
  const out = [];
  for (const p of state.packs) {
    if (filter.subject && filter.subject.length && !filter.subject.includes(p.subject)) continue;
    if (filter.packs && filter.packs.length && !filter.packs.includes(p.id)) continue;
    for (const q of p.questions || []) {
      if (filter.types && filter.types.length && !filter.types.includes(q.type)) continue;
      out.push({ pack: p, q, key: qkey(p, q) });
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
