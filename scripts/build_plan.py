#!/usr/bin/env python3
"""Notion '주간 계획' 을 옮겨 적은 마크다운을 읽어, 사이트 "자료 가져오기" 에 넣을 계획 파일을 만든다.

    python3 scripts/build_plan.py <notion-plan.md> <study-hub-plan.json>

공부 계획은 공개 저장소에 올리지 않는다. 두 파일 다 저장소 밖에 두거나 .gitignore 에 있는 data/private/ 에 둔다.
만든 json 을 사이트 설정 → 자료 가져오기 → 파일 고르기 로 넣으면 이 기기와 비공개 Gist 에만 저장된다.

notion-plan.md 모양:
    === 주차 제목|시작일|끝일|단계|겹치는 일정|Notion 주소
    (목록 앞의 줄들 = 그 주 메모, 예: "아침 영어 / 점심① 한국사")
    - [ ] 큰 할 일 (과목 이름으로 시작)
      - [ ] 10/20(화) 날짜가 있는 작은 할 일
      - [x] 끝낸 것

날짜(M/D)가 앞에 있으면 그날 할 일, 없으면 그 주 할 일이 된다.
"11/10(화) 13 / 11/11(수) 14" 처럼 날짜 여러 개가 ' / ' 로 이어지면 날마다 나눈다.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "private" / "notion-plan.md"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "data" / "private" / "study-hub-plan.json"
YEAR = 2026

SUBJ = [("통합사회", "soc"), ("통합과학", "sci"), ("과탐실", "lab"), ("한국사", "his"), ("일본어", "jpn"),
        ("국어", "kor"), ("영어", "eng"), ("사회", "soc"), ("과학", "sci"), ("대수", "")]
DATE_RE = re.compile(r"(?<![\d.])(\d{1,2})/(\d{1,2})(?:\([월화수목금토일]\))?")


def subject_of(text):
    for name, sid in SUBJ:
        if text.startswith(name):
            return sid, name
    return "", ""


def first_date(text):
    m = DATE_RE.search(text)
    if not m:
        return None
    mo, d = int(m.group(1)), int(m.group(2))
    if not (1 <= mo <= 12 and 1 <= d <= 31):
        return None
    return f"{YEAR}-{mo:02d}-{d:02d}"


def split_multi(text):
    """'11/10(화) 13 / 11/11(수) 14' → 날짜마다 하나씩. 날짜가 2개 이상 ' / ' 로 이어질 때만 나눈다."""
    parts = [p.strip() for p in text.split(" / ")]
    if len(parts) >= 2 and all(DATE_RE.search(p) for p in parts):
        # 첫 조각 앞의 말(예: '아침 ')은 모든 조각에 붙인다
        m = DATE_RE.search(parts[0])
        prefix = parts[0][: m.start()]
        return [parts[0]] + [prefix + p for p in parts[1:]]
    return [text]


def mk_id(*parts):
    return "np-" + hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:10]


def main():
    weeks = []
    cur = None
    group = None
    for raw in SRC.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if line.startswith("=== "):
            title, start, end, stage, overlap, url = (line[4:].split("|") + [""] * 6)[:6]
            cur = {"id": mk_id(title), "title": title, "start": start, "end": end, "stage": stage,
                   "overlap": overlap, "url": url, "note": "", "groups": []}
            weeks.append(cur)
            group = None
            continue
        if cur is None or not line.strip():
            continue
        m = re.match(r"^(\s*)- \[( |x)\] (.*)$", line)
        if not m:
            if not cur["groups"]:
                cur["note"] = (cur["note"] + "\n" + line.strip()).strip()
            continue
        indent, done, text = len(m.group(1)), m.group(2) == "x", m.group(3).strip()
        if indent == 0:
            sid, label = subject_of(text)
            group = {"id": mk_id(cur["title"], text), "title": text, "subject": sid, "label": label, "done": done, "items": []}
            cur["groups"].append(group)
        else:
            if group is None:
                continue
            for t in split_multi(text):
                group["items"].append({"id": mk_id(cur["title"], group["title"], t), "text": t, "date": first_date(t), "done": done})
    # 작은 할 일이 없는 큰 할 일은 그 자체를 할 일 하나로
    for w in weeks:
        for g in w["groups"]:
            if not g["items"]:
                g["items"].append({"id": g["id"] + "-s", "text": g["title"], "date": first_date(g["title"]), "done": g["done"], "self": True})
    out = {"format": "study-hub/1", "plan": {"source": "Notion · School / Exam / 주간 계획", "weeks": weeks}}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n = sum(len(g["items"]) for w in weeks for g in w["groups"])
    nd = sum(1 for w in weeks for g in w["groups"] for i in g["items"] if i["date"])
    print(f"주 {len(weeks)}개, 할 일 {n}개 (날짜 있는 것 {nd}개) → {OUT}")


if __name__ == "__main__":
    main()
