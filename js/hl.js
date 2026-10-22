// 자료 본문의 형광펜과 메모.
// 고른 글자와 그 앞뒤 몇 글자를 저장해 두고, 다음에 열 때 본문에서 다시 찾아 칠한다.
// 자료 본문이 바뀌어 못 찾으면 목록에만 남는다.

export const COLORS = [
  { id: 'y', name: '노랑' },
  { id: 'g', name: '초록' },
  { id: 'p', name: '분홍' },
  { id: 'b', name: '파랑' },
];

function textNodes(root) {
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) out.push(w.currentNode);
  return out;
}

// root 안에서 글자 위치(offset) 를 구한다
function offsetOf(root, node, off) {
  let n = 0;
  for (const t of textNodes(root)) {
    if (t === node) return n + off;
    n += t.nodeValue.length;
  }
  // node 가 요소인 경우 (선택이 요소 경계에 걸림)
  if (node.nodeType === 1) {
    const r = document.createRange();
    r.setStart(root, 0);
    r.setEnd(node, off);
    return r.toString().length;
  }
  return -1;
}

// 지금 선택한 부분을 { text, prefix, suffix } 로. root 밖이거나 비었으면 null
export function selectionAnchor(root) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.commonAncestorContainer)) return null;
  const start = offsetOf(root, r.startContainer, r.startOffset);
  const end = offsetOf(root, r.endContainer, r.endOffset);
  if (start < 0 || end <= start) return null;
  const full = root.textContent;
  const text = full.slice(start, end);
  if (!text.trim()) return null;
  return { text, prefix: full.slice(Math.max(0, start - 24), start), suffix: full.slice(end, end + 24), start };
}

// 저장한 형광펜이 본문의 어디인지 찾는다
export function locate(full, h) {
  const hits = [];
  let i = full.indexOf(h.text);
  while (i >= 0) { hits.push(i); i = full.indexOf(h.text, i + 1); }
  if (!hits.length) return -1;
  if (hits.length === 1) return hits[0];
  let best = hits[0], bestScore = -1;
  for (const s of hits) {
    let score = 0;
    const pre = full.slice(Math.max(0, s - h.prefix.length), s);
    const suf = full.slice(s + h.text.length, s + h.text.length + h.suffix.length);
    for (let k = 1; k <= Math.min(pre.length, h.prefix.length) && pre[pre.length - k] === h.prefix[h.prefix.length - k]; k++) score++;
    for (let k = 0; k < Math.min(suf.length, h.suffix.length) && suf[k] === h.suffix[k]; k++) score++;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

// start~end 글자를 <mark> 로 감싼다 (여러 텍스트 노드에 걸쳐도 된다)
function wrap(root, start, end, h) {
  let n = 0;
  const marks = [];
  for (const t of textNodes(root)) {
    const len = t.nodeValue.length;
    const a = Math.max(start, n), b = Math.min(end, n + len);
    if (a < b) {
      let node = t;
      if (a - n > 0) node = node.splitText(a - n);
      if (b - a < node.nodeValue.length) node.splitText(b - a);
      // 표나 목록 태그 사이의 빈칸 노드는 감싸지 않는다
      if (node.parentNode && !/^(TABLE|TBODY|THEAD|TR|UL|OL)$/.test(node.parentNode.nodeName)) {
        const m = document.createElement('mark');
        m.className = `hl hl-${h.color}${h.note ? ' has-note' : ''}`;
        m.dataset.hl = h.id;
        node.parentNode.insertBefore(m, node);
        m.appendChild(node);
        marks.push(m);
      }
    }
    n += len;
    if (n >= end) break;
  }
  if (marks.length && h.note) marks[marks.length - 1].classList.add('note-end');
  return marks;
}

// 형광펜들을 본문에 칠한다. 못 찾은 것의 id 목록을 돌려준다.
export function paint(root, list) {
  const missing = [];
  const sorted = [...list].sort((a, b) => (a.c || 0) - (b.c || 0));
  for (const h of sorted) {
    const full = root.textContent;
    const s = locate(full, h);
    if (s < 0) { missing.push(h.id); continue; }
    wrap(root, s, s + h.text.length, h);
  }
  return missing;
}
