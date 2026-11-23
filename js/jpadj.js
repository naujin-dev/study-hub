// 일본어 형용사 활용 수행평가 연습: 단어, 활용 규칙, 채점, 틀린 곳 지적. 화면과 상관없는 순수 함수만 둔다.
// 근거: 학교 프린트 "형용사의 활용 (3,4,5과)" 와 3·4과 단어 프린트. 프린트에 없는 활용은 만들지 않는다.

// t: 'i' = い형용사, 'n' = な형용사. 단어는 3·4과 단어 프린트와 활용 프린트에 나온 것만 쓴다.
export const WORDS = [
  { k: 'たかい', ko: '높다·비싸다', t: 'i' }, { k: 'やすい', ko: '싸다', t: 'i' },
  { k: 'あつい', ko: '덥다·두껍다', t: 'i' }, { k: 'さむい', ko: '춥다', t: 'i' },
  { k: 'むずかしい', ko: '어렵다', t: 'i' }, { k: 'やさしい', ko: '쉽다·착하다', t: 'i' },
  { k: 'おもしろい', ko: '재밌다', t: 'i' }, { k: 'つまらない', ko: '재미없다', t: 'i' },
  { k: 'おいしい', ko: '맛있다', t: 'i' }, { k: 'まずい', ko: '맛없다', t: 'i' },
  { k: 'かわいい', ko: '귀엽다', t: 'i' }, { k: 'からい', ko: '맵다', t: 'i' },
  { k: 'ちいさい', ko: '작다', t: 'i' }, { k: 'おおきい', ko: '크다', t: 'i' },
  { k: 'ちかい', ko: '가깝다', t: 'i' }, { k: 'とおい', ko: '멀다', t: 'i' },
  { k: 'おおい', ko: '많다', t: 'i' }, { k: 'すごい', ko: '대단하다', t: 'i' },
  { k: 'はやい', ko: '빠르다', t: 'i' }, { k: 'いい', ko: '좋다·괜찮다', t: 'i', irr: true },
  { k: 'きれいだ', ko: '예쁘다·깨끗하다', t: 'n' }, { k: 'じょうずだ', ko: '잘하다·능숙하다', t: 'n' },
  { k: 'しずかだ', ko: '조용하다', t: 'n' }, { k: 'にぎやかだ', ko: '번화하다·북적거리다', t: 'n' },
  { k: 'すきだ', ko: '좋아하다', t: 'n' }, { k: 'きらいだ', ko: '싫어하다', t: 'n' },
  { k: 'へただ', ko: '못하다·서툴다', t: 'n' }, { k: 'ゆうめいだ', ko: '유명하다', t: 'n' },
  { k: 'べんりだ', ko: '편리하다', t: 'n' }, { k: 'しんせつだ', ko: '친절하다', t: 'n' },
  { k: 'だいじょうぶだ', ko: '괜찮다', t: 'n' }, { k: 'すてきだ', ko: '멋지다', t: 'n' },
];

// 조건. 프린트의 い형용사 10개, な형용사 8개 활용. 번호는 프린트의 ①~⑩.
export const CONDS = {
  i: [
    ['base', '기본형(보통형)', '기본형'], ['polite', '정중형', '기본형 + です'], ['attr', '명사수식형', '기본형 그대로'],
    ['negc', '부정보통형', '어미 い를 く로 바꾸고 + ない'], ['negp', '부정정중형', '어미 い를 く로 바꾸고 + ないです (= ありません)'],
    ['pastc', '과거보통형', '어미 い를 떼고 + かった'], ['pastp', '과거정중형', '어미 い를 떼고 + かった + です'],
    ['te', '접속형', '어미 い를 く로 바꾸고 + て'], ['pastnegc', '과거부정보통형', '어미 い를 く로 바꾸고 + なかった'],
    ['pastnegp', '과거부정정중형', '어미 い를 く로 바꾸고 + なかったです'],
  ],
  n: [
    ['base', '기본형(보통형)', '기본형'], ['polite', '정중형', '어간 + です'], ['attr', '명사수식형', '어간 + な + 명사'],
    ['negc', '부정보통형', '어간 + では(じゃ) ない'], ['negp', '부정정중형', '어간 + では(じゃ) ないです (ありません)'],
    ['pastc', '과거보통형', '어간 + だった'], ['pastp', '과거정중형', '어간 + でした'], ['te', '접속형', '어간 + で'],
  ],
};
export const TYPE_NAME = { i: 'い형용사', n: 'な형용사' };
export const condName = (t, id) => (CONDS[t].find(c => c[0] === id) || [])[1] || id;
export const condRule = (t, id) => (CONDS[t].find(c => c[0] === id) || [])[2] || '';

// 한 단어의 한 조건에 맞는 표현들. main 은 프린트에 적힌 형태, extra 는 문법상 맞지만 프린트에 없는 형태.
export function forms(w, id) {
  const b = w.k;
  if (w.t === 'i') {
    const st = w.irr ? 'よ' : b.slice(0, -1);
    const f = {
      base: [b], polite: [b + 'です'], attr: [b], negc: [st + 'くない'],
      negp: [st + 'くないです', st + 'くありません'], pastc: [st + 'かった'], pastp: [st + 'かったです'],
      te: [st + 'くて'], pastnegc: [st + 'くなかった'], pastnegp: [st + 'くなかったです'],
    };
    const extra = { pastnegp: [st + 'くありませんでした'] };
    return { main: f[id] || [], extra: extra[id] || [] };
  }
  const st = b.slice(0, -1);
  const f = {
    base: [b], polite: [st + 'です'], attr: [st + 'な'], negc: [st + 'ではない', st + 'じゃない'],
    negp: [st + 'ではないです', st + 'じゃないです', st + 'ではありません', st + 'じゃありません'],
    pastc: [st + 'だった'], pastp: [st + 'でした'], te: [st + 'で'],
  };
  return { main: f[id] || [], extra: [] };
}

// ---- 우리말 활용형 (시험 문항은 '맵지 않다', '귀엽습니다' 처럼 우리말로 나온다) ----
// [우리말 기본형, 일본어 단어, 관형형(명사수식), 아/어 형 (~해서)]
export const LEMMAS = [
  ['높다', 'たかい', '높은', '높아'], ['비싸다', 'たかい', '비싼', '비싸'], ['싸다', 'やすい', '싼', '싸'],
  ['덥다', 'あつい', '더운', '더워'], ['두껍다', 'あつい', '두꺼운', '두꺼워'], ['춥다', 'さむい', '추운', '추워'],
  ['어렵다', 'むずかしい', '어려운', '어려워'], ['쉽다', 'やさしい', '쉬운', '쉬워'], ['착하다', 'やさしい', '착한', '착해'],
  ['재밌다', 'おもしろい', '재밌는', '재밌어'], ['재미없다', 'つまらない', '재미없는', '재미없어'],
  ['맛있다', 'おいしい', '맛있는', '맛있어'], ['맛없다', 'まずい', '맛없는', '맛없어'], ['귀엽다', 'かわいい', '귀여운', '귀여워'],
  ['맵다', 'からい', '매운', '매워'], ['작다', 'ちいさい', '작은', '작아'], ['크다', 'おおきい', '큰', '커'],
  ['가깝다', 'ちかい', '가까운', '가까워'], ['멀다', 'とおい', '먼', '멀어'], ['많다', 'おおい', '많은', '많아'],
  ['대단하다', 'すごい', '대단한', '대단해'], ['빠르다', 'はやい', '빠른', '빨라'], ['좋다', 'いい', '좋은', '좋아'],
  ['예쁘다', 'きれいだ', '예쁜', '예뻐'], ['깨끗하다', 'きれいだ', '깨끗한', '깨끗해'], ['잘하다', 'じょうずだ', '잘하는', '잘해'],
  ['능숙하다', 'じょうずだ', '능숙한', '능숙해'], ['조용하다', 'しずかだ', '조용한', '조용해'], ['번화하다', 'にぎやかだ', '번화한', '번화해'],
  ['좋아하다', 'すきだ', '좋아하는', '좋아해'], ['싫어하다', 'きらいだ', '싫어하는', '싫어해'], ['못하다', 'へただ', '못하는', '못해'],
  ['유명하다', 'ゆうめいだ', '유명한', '유명해'], ['편리하다', 'べんりだ', '편리한', '편리해'], ['친절하다', 'しんせつだ', '친절한', '친절해'],
  ['괜찮다', 'だいじょうぶだ', '괜찮은', '괜찮아'], ['멋지다', 'すてきだ', '멋진', '멋져'],
];
const addJong = (str, j) => { const c = str.charCodeAt(str.length - 1) - 0xAC00; return str.slice(0, -1) + String.fromCharCode(0xAC00 + c + j); };
const jongOf = ch => (ch.charCodeAt(0) - 0xAC00) % 28;
function koPolite(stem) {
  const j = jongOf(stem[stem.length - 1]);
  if (j === 0) return addJong(stem, 17) + '니다';           // 예쁘 → 예쁩니다
  if (j === 8) return stem.slice(0, -1) + String.fromCharCode(stem.charCodeAt(stem.length - 1) - 8 + 17) + '니다'; // 멀 → 멉니다
  return stem + '습니다';                                       // 맵 → 맵습니다
}
export function koForm(lemma, cond) {
  const L = LEMMAS.find(x => x[0] === lemma); if (!L) return '';
  const stem = L[0].slice(0, -1), past = addJong(L[3], 20);
  return ({
    base: L[0], polite: koPolite(stem), attr: L[2], negc: stem + '지 않다', negp: stem + '지 않습니다',
    pastc: past + '다', pastp: past + '습니다', te: stem + '고, ' + L[3] + '서',
    pastnegc: stem + '지 않았다', pastnegp: stem + '지 않았습니다',
  })[cond] || '';
}
// 우리말 활용형 10문항 (い형용사 6 + な형용사 4). 같은 단어는 두 번 나오지 않는다.
export function makeKoTest(rand = Math.random) {
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const used = new Set(), out = [];
  for (const t of shuffle([...'iiiiiinnnn'])) {
    const cond = shuffle(CONDS[t].map(c => c[0])).find(c => !out.some(o => o.t === t && o.cond === c)) || CONDS[t][0][0];
    const lem = shuffle(LEMMAS).find(L => WORDS.find(w => w.k === L[1]).t === t && !used.has(L[1]));
    used.add(lem[1]); out.push({ t, cond, lemma: lem[0], k: lem[1], ko: koForm(lem[0], cond) });
  }
  return out;
}

// 시험처럼 10문항: い형용사 6 + な형용사 4 (프린트의 활용 가짓수 비율에 가깝게), 조건은 겹치지 않게 섞는다.
export function makeTest(rand = Math.random) {
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (t, n) => shuffle(CONDS[t].map(c => c[0])).slice(0, n).map(id => ({ t, cond: id }));
  return shuffle([...pick('i', 6), ...pick('n', 4)]);
}

// ---- 채점 ----
const HIRA = /^[ぁ-ゖー]+$/;
export const normalize = s => String(s || '').normalize('NFKC').replace(/[\s　、。,.・~～「」『』()（）\[\]]/g, '');
const isHira = c => /[ぁ-ゖー]/.test(c);
const SMALL = 'ゃゅょっぁぃぅぇぉ';
const PAIRS = ['はばぱ', 'ひびぴ', 'ふぶぷ', 'へべぺ', 'ほぼぽ', 'かが', 'きぎ', 'くぐ', 'けげ', 'こご', 'さざ', 'しじ', 'すず', 'せぜ', 'そぞ', 'ただ', 'ちぢ', 'つづ', 'てで', 'とど'];
const SIMILAR = ['あお', 'ぬめ', 'れわね', 'るろ', 'いり', 'こに', 'さち', 'はほ', 'まも', 'きさ', 'けは', 'ちら', 'そん', 'へく', 'うつ', 'つっ', 'ゆよ'];

// 문자 단위 맞춤(편집 거리). 학생 글 s 와 정답 e 를 나란히 놓고 같은 곳, 바뀐 곳, 더한 곳, 빠진 곳을 돌려준다.
export function align(s, e) {
  const A = [...s], B = [...e], n = A.length, m = B.length;
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
  const ops = []; let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1)) { ops.push(A[i - 1] === B[j - 1] ? { op: 'ok', c: A[i - 1] } : { op: 'sub', c: A[i - 1], e: B[j - 1] }); i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push({ op: 'extra', c: A[i - 1] }); i--; }
    else { ops.push({ op: 'miss', e: B[j - 1] }); j--; }
  }
  return { dist: d[n][m], ops: ops.reverse() };
}

// 명사수식형(な형용사)은 뒤에 명사를 붙여 쓸 수 있으므로 정답 꼴로 시작하면 맞다고 본다.
function matchOf(w, id, text) {
  const { main, extra } = forms(w, id);
  if (main.includes(text)) return { kind: 'ok', form: text };
  if (extra.includes(text)) return { kind: 'extra', form: text };
  if (w.t === 'n' && id === 'attr' && text.startsWith(main[0]) && text.length > main[0].length) return { kind: 'ok', form: main[0], noun: text.slice(main[0].length) };
  return null;
}

// 틀린 이유를 규칙으로 설명한다. 일반 규칙은 프린트의 글을 그대로 쓴다.
function hints(w, id, text, best, ops) {
  const out = [];
  const stI = w.irr ? 'よ' : w.k.slice(0, -1);
  if (!HIRA.test(text)) out.push('히라가나가 아닌 글자(한자·가타카나·알파벳)가 섞였다. 이 수행평가는 히라가나로만 쓴다.');
  if (w.t === 'i') {
    if (/(い|し)(くない|くて|かった|くなかった)/.test(text) && w.k.endsWith('い') && text.includes(w.k) && !best.includes(w.k)) out.push(`어미 い를 ${id === 'pastc' || id === 'pastp' ? '떼고' : 'く로 바꾸고'} 붙여야 한다. ${w.k} 그대로에 붙이지 않는다.`);
    if (/では|じゃ/.test(text)) out.push('い형용사는 では·じゃ 로 부정하지 않는다. い를 く로 바꾸고 ない 를 붙인다 (예: おいしくない).');
    if (w.irr && !['base', 'polite', 'attr'].includes(id) && /^い/.test(text)) out.push('いい는 활용할 때 よい 로 바뀐다 (よくない, よかった, よくて). いい 그대로 붙이지 않는다.');
    if ((id === 'pastc' || id === 'pastp') && /くかった/.test(text)) out.push('과거형은 い를 く로 바꾸는 것이 아니라 떼고 かった를 붙인다 (おいしかった).');
    if (['negc', 'negp', 'pastnegc', 'pastnegp', 'te'].includes(id) && /[^く]かった|い(ない|なかった|て)/.test(text) && !/く/.test(text)) out.push('い가 く로 바뀌지 않았다. 어미 い → く 가 먼저다.');
  } else {
    if (/く(ない|て|なかった)/.test(text)) out.push('な형용사는 い형용사처럼 く로 바꾸지 않는다. 부정은 では(じゃ) ない, 과거는 だった/でした, 접속은 で 이다.');
    if (id === 'attr' && !/な$/.test(text) && !text.startsWith(forms(w, 'attr').main[0])) out.push('な형용사의 명사수식형은 어간 + な 이다 (すきな たべもの).');
    if (id === 'polite' && text.endsWith('だです')) out.push('정중형은 어간 + です 이다. だ를 떼고 쓴다 (すきです).');
    if (/だ(です|ない|った|ありません)/.test(text) && id !== 'pastc' && id !== 'base') out.push('어간에 だ가 남았다. だ를 떼고 활용 꼴을 붙인다.');
  }
  for (const o of ops) {
    if (o.op === 'sub') {
      if (SMALL.includes(o.e) || SMALL.includes(o.c)) out.push(`작은 글자(ゃ·ゅ·ょ·っ) 크기와 위치: '${o.c}' 대신 '${o.e}' 이어야 한다.`);
      else if (PAIRS.some(p => p.includes(o.c) && p.includes(o.e))) out.push(`탁점·반탁점을 확인한다: '${o.c}' 가 아니라 '${o.e}'.`);
      else if (SIMILAR.some(p => p.includes(o.c) && p.includes(o.e))) out.push(`모양이 비슷한 글자를 헷갈렸다: '${o.c}' 가 아니라 '${o.e}'.`);
    }
  }
  return [...new Set(out)];
}

// 한 문항 채점. text 는 학생이 쓴 글(손글씨를 읽은 것이든 키보드로 친 것이든).
export function grade(w, id, raw) {
  const text = normalize(raw);
  const { main, extra } = forms(w, id);
  if (!text) return { ok: false, empty: true, correct: main, text: '', ops: [], hints: ['쓴 글이 없다.'] };
  const hit = matchOf(w, id, text);
  if (hit && hit.kind === 'ok') return { ok: true, text, correct: main, noun: hit.noun };
  if (hit && hit.kind === 'extra') return { ok: false, extraOk: true, text, correct: main, ops: [], hints: [`문법상 맞는 표현이지만 프린트에는 ${main.join(' / ')} 로만 나와 있다. 시험에서는 프린트 형태로 쓴다.`] };
  // 가장 가까운 정답에 맞춰 틀린 글자를 짚는다
  let best = null;
  for (const f of [...main, ...extra]) { const a = align(text, f); if (!best || a.dist < best.a.dist) best = { f, a }; }
  const wrongChars = best.a.ops.filter(o => o.op !== 'ok').length;
  return { ok: false, text, correct: main, nearest: best.f, ops: best.a.ops, hints: hints(w, id, text, best.f, best.a.ops), wrongChars };
}

// 프린트 채점표 (형용사 활용의 정확성: 완전한 표현 개수별 점수, 문자표기의 정확성)
export const SCORE_TABLE = { 10: 100, 9: 74, 8: 68, 7: 62, 6: 56, 5: 50, 4: 44, 3: 38, 2: 32, 1: 26, 0: 20 };
export const scoreOf = n => SCORE_TABLE[Math.max(0, Math.min(10, n))];
// 문자표기: 활용이 맞은 표현에서 히라가나 오류 개수. 맞은 표현은 글자 오류가 없으므로 20 에서 시작해 글자 오류만큼 깎는다(5개 이상 10).
export const kanaScore = errs => (errs <= 0 ? 20 : errs >= 5 ? 10 : 20 - errs * 2);
