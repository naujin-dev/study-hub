// Notion 'School / Exam' 자동 업데이트.
// 예약 작업이 6시간마다 Notion 을 읽어 data/notion.enc.json 을 암호화해서 올린다 (scripts/notion_status.py).
// 사이트는 설정에 넣은 비밀번호로 풀어서 주간 계획(kv notionplan), 시험 범위 현황·Exam 페이지 메모(kv notionstat)에 넣는다.
// 비밀번호는 kv 'secret' 에 두어 비공개 Gist 로 다른 기기에도 간다. 한 기기에서만 넣으면 된다.
import { kvGet, kvSet, kvDel } from './store.js';

const URL_ENC = new URL('../data/notion.enc.json', import.meta.url).href;
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export function getKey() { return kvGet('secret', 'notion')?.key || ''; }
export function setKey(k) { if (k) kvSet('secret', 'notion', { key: k }); else kvDel('secret', 'notion'); }
export function status() { return kvGet('notionstat', 'last') || null; }

async function decrypt(enc, pass) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(enc.salt), iterations: enc.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

// 새 내용이 있으면 받아서 넣는다. 돌려주는 값: 'updated' | 'same' | 'nokey' | 'none' | 'badkey' | 'error'
export async function pull({ force = false } = {}) {
  const pass = getKey();
  if (!pass) return 'nokey';
  let enc;
  try {
    const r = await fetch(URL_ENC + '?t=' + Date.now(), { cache: 'no-store' });
    if (r.status === 404) return 'none';
    if (!r.ok) return 'error';
    enc = await r.json();
  } catch (e) { return 'error'; }
  const cur = status();
  if (!force && cur && cur.h === enc.h) return 'same';
  let body;
  try { body = await decrypt(enc, pass); } catch (e) { return 'badkey'; }
  kvSet('notionplan', 'plan', { plan: body.plan, generated: body.generated });
  kvSet('notionstat', 'last', { h: enc.h, generated: body.generated, scope: body.scope || [], exam_md: body.exam_md || '' });
  return 'updated';
}

// 시험 범위 현황 요약: 회독 칸을 몇 개 채웠는지
export function scopeSummary(scope) {
  const rows = scope || [];
  const cells = rows.length * 3;
  const done = rows.reduce((a, r) => a + (r.r1 ? 1 : 0) + (r.r2 ? 1 : 0) + (r.r3 ? 1 : 0), 0);
  return { rows: rows.length, cells, done, pct: cells ? Math.round(done / cells * 100) : 0 };
}
