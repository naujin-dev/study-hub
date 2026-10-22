// 기록 화면의 그래프. 인라인 SVG, 색은 CSS 변수(--acc 등)를 쓴다.
import * as S from './store.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 잔디 달력 ----------
// days: [{date, value(분), label}] 시작~끝 날짜. 열 = 주, 행 = 요일
export function heatmap(days, { marks = [], max } = {}) {
  if (!days.length) return '';
  const cell = 15, gap = 3, top = 18, left = 22;
  const first = new Date(days[0].date + 'T00:00:00');
  const offset = first.getDay(); // 일요일=0
  const cols = Math.ceil((days.length + offset) / 7);
  const W = left + cols * (cell + gap), H = top + 7 * (cell + gap);
  const peak = max || Math.max(30, ...days.map(d => d.value));
  const level = v => (v <= 0 ? 0 : v < peak * 0.25 ? 1 : v < peak * 0.5 ? 2 : v < peak * 0.75 ? 3 : 4);
  const op = [0, 0.25, 0.45, 0.7, 1];
  let s = `<svg class="chart heat" viewBox="0 0 ${W} ${H}" role="img" aria-label="날짜별 공부 시간 달력" style="max-width:${W * 2.2}px">`;
  ['일', '', '화', '', '목', '', '토'].forEach((w, i) => { if (w) s += `<text x="0" y="${top + i * (cell + gap) + cell - 3}" class="ax">${w}</text>`; });
  // 월 이름: 그 달의 첫 날이 들어 있는 열 위에 쓴다. 다음 달 이름과 두 칸 이상 떨어져야 쓴다 (겹치지 않게).
  const labels = [];
  days.forEach((d, i) => {
    const m = Number(d.date.slice(5, 7));
    if (!labels.length || labels[labels.length - 1].m !== m) labels.push({ m, c: Math.floor((i + offset) / 7) });
  });
  labels.forEach((l, k) => {
    const next = labels[k + 1];
    if (next && next.c - l.c < 2) return;
    s += `<text x="${left + l.c * (cell + gap)}" y="11" class="ax">${l.m}월</text>`;
  });
  days.forEach((d, i) => {
    const k = i + offset, c = Math.floor(k / 7), r = k % 7;
    const x = left + c * (cell + gap), y = top + r * (cell + gap);
    const lv = level(d.value);
    const isMark = marks.includes(d.date);
    const fut = d.future;
    s += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" class="hc${lv ? '' : ' zero'}${fut ? ' fut' : ''}" style="${lv ? `fill:var(--acc);fill-opacity:${op[lv]}` : ''}" data-tip="${esc(d.label)}"></rect>`;
    if (isMark) s += `<rect x="${x - 1.5}" y="${y - 1.5}" width="${cell + 3}" height="${cell + 3}" rx="4" class="hmark" pointer-events="none"></rect>`;
  });
  s += '</svg>';
  s += `<div class="heat-legend small muted"><span>적음</span>${op.map((o, i) => `<i style="${i ? `background:var(--acc);opacity:${o}` : ''}"${i ? '' : ' class="zero"'}></i>`).join('')}<span>많음</span><span style="margin-left:10px"><i class="mk"></i> 시험일</span></div>`;
  return s;
}

// ---------- 꺾은선 (한 계열) ----------
// pts: [{x: 'YYYY-MM-DD', y: 숫자, tip}] , fmt: y 값 글자로
export function line(pts, { fmt = v => String(v), area = true, height = 170, yMax, label = '', width = 640 } = {}) {
  if (pts.length < 2) return '<p class="small muted">기록이 이틀 이상 쌓이면 그래프가 나온다.</p>';
  const W = Math.max(260, Math.round(width)), H = height, L = 44, R = 46, T = 12, B = 24;
  const ys = pts.map(p => p.y).filter(v => v != null);
  const top = yMax ?? niceStep(Math.max(...ys, 1) / 4) * 4;
  const X = i => L + (i / (pts.length - 1)) * (W - L - R);
  const Y = v => T + (1 - v / top) * (H - T - B);
  let s = `<svg class="chart line" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
  // 가로 눈금 4개
  for (let k = 0; k <= 4; k++) {
    const v = (top * k) / 4, y = Y(v);
    s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="grid"></line><text x="${L - 6}" y="${y + 4}" class="ax" text-anchor="end">${esc(fmt(v))}</text>`;
  }
  // 날짜 눈금: 처음, 가운데, 끝
  [0, Math.floor((pts.length - 1) / 2), pts.length - 1].forEach(i => {
    const d = pts[i].x;
    s += `<text x="${X(i)}" y="${H - 6}" class="ax" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${Number(d.slice(5, 7))}/${Number(d.slice(8))}</text>`;
  });
  // 선 (값이 없는 날은 끊는다)
  let path = '', open = false, firstX = null, lastX = null;
  pts.forEach((p, i) => {
    if (p.y == null) { open = false; return; }
    path += `${open ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`;
    if (firstX == null) firstX = X(i);
    lastX = X(i);
    open = true;
  });
  if (area && !pts.some(p => p.y == null)) s += `<path d="${path}L${lastX},${Y(0)}L${firstX},${Y(0)}Z" class="area"></path>`;
  s += `<path d="${path}" class="ln"></path>`;
  // 끝 점과 값
  let li = pts.length - 1; while (li > 0 && pts[li].y == null) li--;
  if (pts[li].y != null) s += `<circle cx="${X(li)}" cy="${Y(pts[li].y)}" r="4.5" class="dot"></circle><text x="${X(li) + 8}" y="${Y(pts[li].y) + 4}" class="val">${esc(fmt(pts[li].y))}</text>`;
  // 마우스·터치용 칸
  const bw = (W - L - R) / Math.max(1, pts.length - 1);
  pts.forEach((p, i) => {
    s += `<rect x="${X(i) - bw / 2}" y="${T}" width="${bw}" height="${H - T - B}" class="hit" data-tip="${esc(p.tip)}" data-cx="${X(i)}" data-cy="${p.y == null ? '' : Y(p.y)}"></rect>`;
  });
  s += `<line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" style="display:none"></line><circle class="cross-dot" r="4.5" style="display:none"></circle>`;
  s += '</svg>';
  return s;
}

function niceStep(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// ---------- 툴팁 (모든 그래프 공통) ----------
let tipEl = null;
export function bindTips(root) {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip';
    document.body.appendChild(tipEl);
  }
  const show = (target, cx, cy) => {
    const tip = target.dataset.tip;
    if (!tip) return hide();
    tipEl.innerHTML = tip.replace(/\n/g, '<br>');
    tipEl.style.display = 'block';
    const r = tipEl.getBoundingClientRect();
    let x = cx + 12, y = cy - r.height - 10;
    if (x + r.width > innerWidth - 8) x = cx - r.width - 12;
    if (y < 8) y = cy + 16;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
    const svg = target.ownerSVGElement;
    if (svg && target.dataset.cx) {
      const ln = svg.querySelector('.cross'), dot = svg.querySelector('.cross-dot');
      ln.setAttribute('x1', target.dataset.cx); ln.setAttribute('x2', target.dataset.cx); ln.style.display = '';
      if (target.dataset.cy) { dot.setAttribute('cx', target.dataset.cx); dot.setAttribute('cy', target.dataset.cy); dot.style.display = ''; } else dot.style.display = 'none';
    }
  };
  const hide = () => {
    if (tipEl) tipEl.style.display = 'none';
    root.querySelectorAll('.cross,.cross-dot').forEach(e => (e.style.display = 'none'));
  };
  root.querySelectorAll('[data-tip]').forEach(el => {
    el.addEventListener('pointerenter', e => show(el, e.clientX, e.clientY));
    el.addEventListener('pointermove', e => show(el, e.clientX, e.clientY));
    el.addEventListener('pointerleave', hide);
    el.addEventListener('pointerdown', e => show(el, e.clientX, e.clientY));
  });
  document.addEventListener('scroll', hide, { passive: true, once: true });
}

// ---------- 데이터 만들기 ----------
export function dayRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = S.addDays(d, 1)) out.push(d);
  return out;
}
