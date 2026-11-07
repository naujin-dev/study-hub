// Gemini API 호출. API 키는 이 기기의 브라우저에만 저장하고, 요청은 브라우저에서 Google 로 바로 보낸다.
import { load } from './store.js';
import { SUBJ, essayMax } from './data.js';
import { textsForAI } from './src.js';

// '-latest' 이름은 Google 이 가장 새 모델로 알아서 이어 준다 (모델 이름이 바뀌어도 그대로 쓴다)
export const MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', note: '무료 등급에서 쓸 수 있다. 기본값.' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash (가장 새 버전)', note: 'Google 이 고르는 최신 Flash.' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash-Lite', note: '무료 한도가 더 넉넉하고 빠르다. 서술형 채점은 덜 꼼꼼하다.' },
  { id: 'gemini-pro-latest', name: 'Gemini Pro', note: '가장 꼼꼼하다. 무료 등급에서는 막혀 있을 수 있다.' },
];
let lastModel = '';
const API = 'https://generativelanguage.googleapis.com/v1beta/models/';

export function settings() {
  const s = { model: MODELS[0].id, geminiKey: '', ...load('settings', {}) };
  // 예전 Claude 모델 설정, 그리고 직접 고르지 않은 '최신 Flash' 는 3 Flash 로
  if (!MODELS.some(m => m.id === s.model) || (s.model === 'gemini-flash-latest' && !s.modelPicked)) s.model = MODELS[0].id;
  return s;
}
export function hasKey() {
  return !!settings().geminiKey;
}

// 한 번 묻고 답을 받는다. schema 가 있으면 JSON 객체로 돌려준다.
async function ask({ system, user, schema, maxTokens = 8000, key = '' }) {
  const s = { ...settings(), ...(key ? { geminiKey: key } : {}) };
  if (!s.geminiKey) throw new Error('설정에서 Gemini API 키를 먼저 넣어 줘.');
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (schema) Object.assign(body.generationConfig, { responseMimeType: 'application/json', responseJsonSchema: schema });
  let res, data;
  for (let tries = 0; ; tries++) {
    try {
      res = await fetch(API + encodeURIComponent(s.model) + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error('인터넷 연결을 확인해 줘.');
    }
    data = await res.json().catch(() => ({}));
    // 서버가 잠깐 바쁠 때는 두 번까지 다시 해 본다
    if ((res.status === 503 || res.status === 500) && tries < 2) { await new Promise(r => setTimeout(r, 1500 * (tries + 1))); continue; }
    break;
  }
  if (!res.ok) throw new Error(explainError(res.status, data?.error?.message || ''));
  if (data.promptFeedback?.blockReason) throw new Error('Gemini 가 이 요청을 처리하지 않았다. 문장을 조금 바꿔서 다시 해 줘.');
  const cand = data.candidates?.[0];
  if (!cand) throw new Error('Gemini 가 답을 주지 않았다. 다시 시도해 줘.');
  if (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION'].includes(cand.finishReason)) throw new Error('Gemini 가 이 요청을 처리하지 않았다. 문장을 조금 바꿔서 다시 해 줘.');
  if (cand.finishReason === 'MAX_TOKENS') throw new Error('답이 너무 길어서 중간에 끊겼다. 다시 시도해 줘.');
  lastModel = data.modelVersion || s.model;
  const text = (cand.content?.parts || []).filter(x => x.text && !x.thought).map(x => x.text).join('');
  if (!schema) return text;
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch (e) {
    throw new Error('AI 답을 읽지 못했다. 다시 시도해 줘.');
  }
}

function explainError(st, msg) {
  if (st === 400 && /api key|API_KEY/i.test(msg)) return 'API 키가 맞지 않는다. 설정에서 키를 다시 확인해 줘.';
  if (st === 400) return '요청 형식 오류다. 다른 모델을 골라 다시 해 봐.';
  if (st === 401 || st === 403) return '이 API 키로는 이 모델을 쓸 수 없다. 키를 확인하거나 설정에서 다른 모델을 골라 봐.';
  if (st === 404) return '모델을 찾지 못했다. 설정에서 다른 모델을 골라 줘.';
  if (st === 429) return '무료 한도를 다 썼다. 1분쯤 뒤에 다시 하거나, 하루 한도면 내일 다시 해 줘. 설정에서 Flash-Lite 로 바꾸면 한도가 더 넉넉하다.';
  if (st >= 500) return 'Google 서버가 지금 바쁘다. 잠시 뒤 다시 해 줘.';
  return `오류 ${st}. 잠시 뒤 다시 해 줘.`;
}

export async function testKey(key = '') {
  const t = await ask({ system: '짧게 답한다.', user: '"연결됨" 이라고만 답해.', maxTokens: 2000, key });
  return `${t.trim().slice(0, 20)} · 답한 모델: ${lastModel}`;
}

const GRADER_SYSTEM = `너는 한국 고등학교 1학년 정기고사(2회고사) 채점 선생님이다.
학생이 직접 공부하려고 쓰는 연습 사이트에서 답안을 채점한다.

원칙:
- 채점 기준표(rubric)의 항목마다 따로 점수를 준다. 항목 배점을 넘기지 않는다.
- 모범 답안과 표현이 달라도 뜻이 같으면 인정한다. 핵심 용어가 빠졌거나 개념이 틀리면 깎는다.
- 학교 서술형 채점처럼 엄격하게 본다. 부분 점수는 기준에 맞는 만큼만 준다.
- 맞춤법은 뜻이 바뀌지 않으면 깎지 않는다. 단, 영어·일본어 과목에서 문법과 철자를 묻는 문제면 깎는다.
- 피드백은 학생에게 직접 말하듯 반말로, 짧고 구체적으로 쓴다. "~해 봐", "~가 빠졌어" 같은 식.
- 칭찬이나 격려 문구를 덧붙이지 않는다. 무엇이 맞았고 무엇이 빠졌는지만 쓴다.
- improved_answer 에는 학생 답을 바탕으로 만점을 받을 수 있게 고친 답안을 쓴다. 학생이 쓴 내용은 최대한 살린다.`;

const GRADE_SCHEMA = {
  type: 'object',
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          earned: { type: 'number' },
          max: { type: 'number' },
          comment: { type: 'string' },
        },
        required: ['criterion', 'earned', 'max', 'comment'],
        additionalProperties: false,
      },
    },
    good: { type: 'string', description: '맞게 쓴 부분. 없으면 빈 문자열' },
    missing: { type: 'string', description: '빠졌거나 틀린 부분' },
    improved_answer: { type: 'string' },
  },
  required: ['criteria', 'good', 'missing', 'improved_answer'],
  additionalProperties: false,
};

function essayUser(pack, q, answer) {
  const max = essayMax(q);
  const rubric = (q.rubric || []).map((r, i) => `${i + 1}. ${r.criterion} (${r.points}점)`).join('\n');
  return `과목: ${SUBJ[pack.subject]?.name || pack.subject}
단원: ${pack.unit || pack.title}

[문제] (총 ${max}점)
${q.context ? q.context + '\n\n' : ''}${q.question}

[채점 기준]
${rubric}

[모범 답안]
${q.model_answer}

[학생 답안]
${String(answer || '').trim() || '(빈 답안)'}`;
}

// 점수를 기준표 배점에 맞춰 다시 계산한다.
function essayResult(q, out) {
  const max = essayMax(q);
  const crit = (q.rubric || []).map((r, i) => {
    const got = (out.criteria || [])[i] || {};
    const earned = Math.max(0, Math.min(r.points, Number(got.earned) || 0));
    return { criterion: r.criterion, max: r.points, earned, comment: got.comment || '' };
  });
  const score = crit.reduce((s, c) => s + c.earned, 0);
  return { kind: 'essay', score, max, criteria: crit, good: out.good || '', missing: out.missing || '', improved: out.improved_answer || out.improved || '' };
}

export async function gradeEssay(pack, q, answer) {
  const user = essayUser(pack, q, answer);
  const out = await ask({ system: GRADER_SYSTEM, user, schema: GRADE_SCHEMA, maxTokens: 8000 });
  return essayResult(q, out);
}

const SHORT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['correct', 'partial', 'wrong'] },
    reason: { type: 'string' },
  },
  required: ['verdict', 'reason'],
  additionalProperties: false,
};

function shortUser(pack, q, answer) {
  return `과목: ${SUBJ[pack.subject]?.name || pack.subject}
[문제]
${q.context ? q.context + '\n\n' : ''}${q.question}

[정답으로 인정하는 답] ${q.answers.join(' / ')}
${q.explanation ? '[해설] ' + q.explanation + '\n' : ''}
[학생 답] ${answer}

학생 답이 정답과 같은 뜻인지 판단해. 띄어쓰기, 조사 차이, 같은 대상을 가리키는 다른 표기(한자/한글, 약어)는 정답으로 본다.
개념이 다르거나 더 넓거나 좁은 말이면 틀린 답이다. 영어·일본어 철자가 틀리면 틀린 답이다.
일부만 맞으면 partial. reason 은 학생에게 반말로 한두 문장.`;
}

export async function judgeShort(pack, q, answer) {
  return ask({ system: '너는 고등학교 시험 단답형 채점 선생님이다.', user: shortUser(pack, q, answer), schema: SHORT_SCHEMA, maxTokens: 4000 });
}

// ---------- API 키 없이: claude.ai 채팅에 붙여넣을 채점 요청 ----------
export function essayChatPrompt(pack, q, answer) {
  const n = (q.rubric || []).length;
  return `${GRADER_SYSTEM}

아래 답안을 채점해 줘.

${essayUser(pack, q, answer)}

답은 아래 모양의 JSON 코드 블록 하나로만 해. 다른 말은 쓰지 마.
criteria 는 채점 기준 순서대로 ${n}개. earned 는 그 기준에서 받은 점수(배점 이하).
\`\`\`json
{"criteria":[${(q.rubric || []).map(r => `{"earned":0,"comment":"(${r.points}점 기준에 대한 한 줄 평)"}`).join(',')}],"good":"맞게 쓴 부분","missing":"빠졌거나 틀린 부분","improved_answer":"학생 답을 살려서 만점이 되게 고친 답안"}
\`\`\``;
}
export function shortChatPrompt(pack, q, answer) {
  return `너는 고등학교 시험 단답형 채점 선생님이다.

${shortUser(pack, q, answer)}

답은 아래 모양의 JSON 코드 블록 하나로만 해. verdict 는 correct, partial, wrong 중 하나.
\`\`\`json
{"verdict":"correct","reason":"한두 문장"}
\`\`\``;
}

function pickJSON(text) {
  const t = String(text || '');
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  let body = fence ? fence[1] : t;
  const a = body.indexOf('{'), b = body.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Claude 답에서 { } 부분을 찾지 못했다. 코드 블록을 통째로 복사해 줘.');
  try { return JSON.parse(body.slice(a, b + 1)); }
  catch (e) { throw new Error('Claude 답을 읽지 못했다. 코드 블록 안 내용을 빠짐없이 복사했는지 확인해 줘.'); }
}
export function parseEssayReply(q, text) {
  const out = pickJSON(text);
  if (!Array.isArray(out.criteria)) throw new Error('답에 criteria 가 없다. Claude 에게 "JSON 형식으로만 다시 답해 줘" 라고 보내 줘.');
  return essayResult(q, out);
}
export function parseShortReply(text) {
  const out = pickJSON(text);
  if (!['correct', 'partial', 'wrong'].includes(out.verdict)) throw new Error('답에 verdict 가 없다. Claude 에게 "JSON 형식으로만 다시 답해 줘" 라고 보내 줘.');
  return { verdict: out.verdict, reason: String(out.reason || '') };
}

export async function askAboutPack(pack, question, history) {
  const prev = (history || []).slice(-4).map(h => `학생: ${h.q}\n선생님: ${h.a}`).join('\n\n');
  const user = `[공부자료: ${pack.title}]
${(pack.notes || '').slice(0, 60000)}${textsForAI(pack) ? '\n\n' + textsForAI(pack) : ''}

${prev ? '[앞에서 나눈 대화]\n' + prev + '\n\n' : ''}[학생 질문]
${question}`;
  return ask({
    system: `너는 고등학교 1학년의 ${SUBJ[pack.subject]?.name || ''} 선생님이다. 학생이 2회고사를 준비하며 공부자료를 읽다가 묻는다.
공부자료 내용을 기준으로 답하고, 자료에 없는 내용이면 그렇다고 먼저 말한 뒤 교과 수준에서 설명한다.
반말로, 짧게, 예시를 들어 설명한다. 마크다운을 써도 된다. 인사말이나 맺음말은 쓰지 않는다.`,
    user,
    maxTokens: 8000,
  });
}

const GEN_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['mcq', 'short', 'essay'] },
          question: { type: 'string' },
          context: { type: 'string', description: '지문이나 자료. 없으면 빈 문자열' },
          choices: { type: 'array', items: { type: 'string' }, description: '객관식 보기 5개. 다른 유형은 빈 배열' },
          answer: { type: 'integer', description: '객관식 정답 번호(1부터). 다른 유형은 0' },
          answers: { type: 'array', items: { type: 'string' }, description: '단답형 정답 후보들. 다른 유형은 빈 배열' },
          rubric: {
            type: 'array',
            items: {
              type: 'object',
              properties: { criterion: { type: 'string' }, points: { type: 'integer' } },
              required: ['criterion', 'points'],
              additionalProperties: false,
            },
            description: '서술형 채점 기준. 다른 유형은 빈 배열',
          },
          model_answer: { type: 'string', description: '서술형 모범 답안. 다른 유형은 빈 문자열' },
          explanation: { type: 'string' },
          difficulty: { type: 'integer', enum: [1, 2, 3] },
        },
        required: ['type', 'question', 'context', 'choices', 'answer', 'answers', 'rubric', 'model_answer', 'explanation', 'difficulty'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

function genUser(pack, { types, count, difficulty, focus }) {
  const existing = (pack.questions || []).map(q => '- ' + q.question.slice(0, 80)).join('\n');
  const user = `[공부자료: ${pack.title}]
${(pack.notes || '').slice(0, 60000)}${textsForAI(pack) ? '\n\n' + textsForAI(pack) : ''}

${(pack.cards || []).length ? '[암기 항목]\n' + pack.cards.map(c => `- ${c.front}: ${c.back}`).join('\n') + '\n\n' : ''}[이미 있는 문제] (겹치지 않게)
${existing || '(없음)'}

위 자료로 2회고사 대비 문제를 ${count}개 만들어.
- 유형: ${types.map(t => ({ mcq: '객관식(5지선다)', short: '단답형', essay: '서술형' }[t])).join(', ')} 를 섞어서
- 난이도: ${difficulty === 0 ? '쉬움부터 어려움까지 고르게' : ['', '쉬움', '보통', '어려움'][difficulty]}
${focus ? '- 특히 이 부분: ' + focus : ''}
- 학교 정기고사에 실제로 나올 법한 문제. 자료에 근거가 있는 내용만 쓴다.
- 객관식 오답 보기는 학생이 자주 헷갈리는 개념으로 만든다. "모두 고르면" 문제는 만들지 않는다.
- 단답형 answers 에는 띄어쓰기·표기만 다른 정답도 모두 넣는다.
- 서술형 rubric 배점 합은 4~10점, model_answer 는 만점 답안.
- explanation 은 왜 그게 답인지 두세 문장.`;
  return user;
}

export async function generateQuestions(pack, opts) {
  const user = genUser(pack, opts);
  const out = await ask({ system: '너는 고등학교 1학년 정기고사 출제 선생님이다.', user, schema: GEN_SCHEMA, maxTokens: 32000 });
  return out.questions.map(q => {
    const base = { type: q.type, question: q.question, explanation: q.explanation, difficulty: q.difficulty };
    if (q.context) base.context = q.context;
    if (q.type === 'mcq') return { ...base, choices: q.choices, answer: q.answer };
    if (q.type === 'short') return { ...base, answers: q.answers };
    return { ...base, rubric: q.rubric, model_answer: q.model_answer };
  });
}

// API 키 없이: 채팅 Claude 가 사이트 형식 JSON 으로 문제를 주게 하는 프롬프트
export function genChatPrompt(pack, opts, newId) {
  return `너는 고등학교 1학년 정기고사 출제 선생님이다.

${genUser(pack, opts)}

답은 아래 모양의 JSON 코드 블록 하나로만 해. 다른 말은 쓰지 마.
- id, subject, title 은 그대로 둔다.
- 객관식: "type":"mcq", "choices" 보기 5개(앞에 번호 붙이지 않기), "answer" 정답 번호(1부터).
- 단답형: "type":"short", "answers" 인정할 답 목록.
- 서술형: "type":"essay", "rubric" [{"criterion","points"}], "model_answer".
- 문제 id 는 "q1", "q2" ... 순서대로. 지문이 필요하면 "context" 에.
\`\`\`json
{"format":"study-hub/1","id":"${newId}","subject":"${pack.subject}","unit":${JSON.stringify(pack.unit || pack.title)},"title":${JSON.stringify(pack.title + ' (AI 문제)')},"order":${(pack.order ?? 999) + 0.5},"questions":[{"id":"q1","type":"mcq","question":"","choices":["","","","",""],"answer":1,"explanation":"","difficulty":2}]}
\`\`\``;
}

export function askChatPrompt(pack, question) {
  return `너는 고등학교 1학년의 ${SUBJ[pack.subject]?.name || ''} 선생님이다. 내가 2회고사를 준비하며 아래 공부자료를 읽다가 질문해.
공부자료 내용을 기준으로 답하고, 자료에 없는 내용이면 그렇다고 먼저 말한 뒤 교과 수준에서 설명해. 반말로, 짧게, 예시를 들어.

[공부자료: ${pack.title}]
${(pack.notes || '').slice(0, 60000)}${textsForAI(pack) ? '\n\n' + textsForAI(pack) : ''}

[질문]
${question}`;
}
