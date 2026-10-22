#!/usr/bin/env python3
"""data/packs/ 안의 자료 파일을 검사하고 data/index.json 을 다시 만든다.

    python3 scripts/check_packs.py          # 검사하고 index.json 쓰기
    python3 scripts/check_packs.py --check  # 검사만 (파일을 안 바꾼다)

규칙은 js/data.js 의 validatePack 과 같다. 하나라도 틀리면 종료 코드 1.
틀린 파일은 index.json 에 넣지 않는다.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKS = ROOT / "data" / "packs"
INDEX = ROOT / "data" / "index.json"
EXAM = ROOT / "data" / "exam.json"

FORMAT = "study-hub/1"
SUBJECTS = ["kor", "eng", "soc", "sci", "his", "lab", "jpn"]
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def check_pack(p, where):
    err = []
    e = err.append
    if not isinstance(p, dict):
        return [f"{where}: 객체가 아니다."]
    if p.get("format") not in (None, FORMAT):
        e(f'{where}: format 은 "{FORMAT}" 이어야 한다.')
    if not isinstance(p.get("id"), str) or not ID_RE.match(p["id"]):
        e(f"{where}: id 는 영어 소문자, 숫자, - 만 쓴다.")
    if p.get("subject") not in SUBJECTS:
        e(f"{where}: subject 는 {', '.join(SUBJECTS)} 중 하나여야 한다. (지금: {p.get('subject')})")
    if not isinstance(p.get("title"), str) or not p["title"].strip():
        e(f"{where}: title 이 비어 있다.")
    for k in ("unit", "notes", "summary"):
        if k in p and p[k] is not None and not isinstance(p[k], str):
            e(f"{where}: {k} 는 문자열이어야 한다.")
    texts = p.get("texts") or []
    if not isinstance(texts, list):
        e(f"{where}: texts 는 배열이어야 한다.")
        texts = []
    for i, t in enumerate(texts):
        if not isinstance(t, dict) or not isinstance(t.get("body"), str) or not t["body"].strip():
            e(f"{where} texts[{i}]: body(본문 글)가 비어 있다.")
    seen = set()
    cards = p.get("cards") or []
    if not isinstance(cards, list):
        e(f"{where}: cards 는 배열이어야 한다.")
        cards = []
    for i, c in enumerate(cards):
        w = f"{where} cards[{i}]"
        if not isinstance(c, dict) or not isinstance(c.get("front"), str) or not isinstance(c.get("back"), str):
            e(f"{w}: front, back 이 문자열이어야 한다.")
            continue
        if c.get("id") is not None:
            if ("c", c["id"]) in seen:
                e(f'{w}: id "{c["id"]}" 가 겹친다.')
            seen.add(("c", c["id"]))
    qs = p.get("questions") or []
    if not isinstance(qs, list):
        e(f"{where}: questions 는 배열이어야 한다.")
        qs = []
    for i, q in enumerate(qs):
        w = f"{where} questions[{i}]"
        if not isinstance(q, dict):
            e(f"{w}: 객체가 아니다.")
            continue
        qid = q.get("id")
        if not isinstance(qid, (str, int)) or isinstance(qid, bool):
            e(f"{w}: id 가 없다.")
        else:
            if ("q", qid) in seen:
                e(f'{w}: id "{qid}" 가 겹친다.')
            seen.add(("q", qid))
        if not isinstance(q.get("question"), str) or not q["question"].strip():
            e(f"{w}: question 이 비어 있다.")
        t = q.get("type")
        if t == "mcq":
            ch = q.get("choices")
            if not isinstance(ch, list) or len(ch) < 2 or not all(isinstance(x, str) for x in ch):
                e(f"{w}: choices 는 문자열 2개 이상인 배열이어야 한다.")
                ch = []
            ans = q.get("answer")
            ans = ans if isinstance(ans, list) else [ans]
            if not ans or not all(is_int(a) and 1 <= a <= len(ch) for a in ans):
                e(f"{w}: answer 는 1부터 {len(ch)} 사이 번호(또는 번호 배열)여야 한다.")
        elif t == "short":
            a = q.get("answers")
            if not isinstance(a, list) or not a or not all(isinstance(x, str) and x.strip() for x in a):
                e(f"{w}: answers 는 정답으로 인정할 문자열 배열이어야 한다.")
        elif t == "essay":
            if not isinstance(q.get("model_answer"), str) or not q["model_answer"].strip():
                e(f"{w}: model_answer(모범 답안)가 없다.")
            r = q.get("rubric")
            if not isinstance(r, list) or not r or not all(
                isinstance(x, dict) and isinstance(x.get("criterion"), str) and isinstance(x.get("points"), (int, float)) for x in r
            ):
                e(f"{w}: rubric 은 {{criterion, points}} 배열이어야 한다.")
        else:
            e(f"{w}: type 은 mcq, short, essay 중 하나여야 한다. (지금: {t})")
    return err


def check_exam():
    err = []
    try:
        ex = json.loads(EXAM.read_text(encoding="utf-8"))
    except Exception as x:  # noqa: BLE001
        return [f"data/exam.json: 읽지 못했다 ({x})"]
    days = ex.get("days", [])
    if not isinstance(days, list) or not all(isinstance(d, str) and DATE_RE.match(d) for d in days):
        err.append("data/exam.json: days 는 YYYY-MM-DD 문자열 배열이어야 한다.")
    for sid, v in (ex.get("subjects") or {}).items():
        if sid not in SUBJECTS:
            err.append(f"data/exam.json: 모르는 과목 id {sid}")
            continue
        d = (v or {}).get("date")
        if d is not None and (not isinstance(d, str) or not DATE_RE.match(d)):
            err.append(f"data/exam.json: {sid}.date 는 YYYY-MM-DD 이거나 null 이어야 한다.")
    return err


def main():
    only_check = "--check" in sys.argv
    errors = []
    entries = []
    ids = {}
    for f in sorted(PACKS.rglob("*.json")):
        rel = f.relative_to(ROOT / "data").as_posix()
        try:
            p = json.loads(f.read_text(encoding="utf-8"))
        except Exception as x:  # noqa: BLE001
            errors.append(f"{rel}: JSON 이 아니다 ({x})")
            continue
        errs = check_pack(p, rel)
        if isinstance(p, dict) and isinstance(p.get("id"), str):
            if p["id"] in ids:
                errs.append(f'{rel}: id "{p["id"]}" 가 {ids[p["id"]]} 와 겹친다.')
            ids.setdefault(p["id"], rel)
        if errs:
            errors.extend(errs)
            continue
        qs = p.get("questions") or []
        entries.append({
            "path": rel,
            "id": p["id"],
            "subject": p["subject"],
            "title": p["title"],
            "unit": p.get("unit", ""),
            "order": p.get("order"),
            "updated": p.get("updated", ""),
            "questions": len(qs),
            "cards": len(p.get("cards") or []),
        })
    errors.extend(check_exam())

    index = {"generated_by": "scripts/check_packs.py", "packs": entries}
    text = json.dumps(index, ensure_ascii=False, indent=1) + "\n"
    if not only_check:
        old = INDEX.read_text(encoding="utf-8") if INDEX.exists() else ""
        if old != text:
            INDEX.write_text(text, encoding="utf-8")
            print("data/index.json 을 새로 썼다.")

    total_q = sum(x["questions"] for x in entries)
    print(f"자료 {len(entries)}개, 문제 {total_q}개 통과.")
    if errors:
        print(f"\n고칠 것 {len(errors)}개:")
        for m in errors:
            print(" -", m)
        sys.exit(1)


if __name__ == "__main__":
    main()
