#!/usr/bin/env python3
"""Notion 'School / Exam' 을 사이트로 보내는 암호화 파일을 만든다. 예약 작업이 6시간마다 돌린다.

    NOTION_SYNC_KEY=비밀번호 python3 scripts/notion_status.py

읽는 것 (모두 data/private/, git 이 무시한다):
    notion-plan.md     주간 계획 (형식은 scripts/build_plan.py 맨 위 설명)
    notion-scope.json  시험 범위 표 [{"subject": "사회", "range": "통합사회 3단원", "r1": true, "r2": false,
                        "r3": false, "solve": false, "memo": "", "url": "..."}]
    notion-exam.md     Exam 페이지 본문 (하루 공부 시간, 회독 흐름 같은 표). 마크다운 그대로
쓰는 것:
    data/notion.enc.json  암호화한 묶음. 공개 저장소에 올라가도 비밀번호 없이는 못 읽는다.
                          사이트가 설정에 넣은 비밀번호로 풀어서 계획·현황 화면에 보여 준다.

내용이 지난번과 같으면 파일을 건드리지 않는다 (h = 평문 해시). 바뀌었으면 "changed" 를 출력한다.
암호: PBKDF2-SHA256(비밀번호, salt, 210000회) 로 만든 키로 AES-256-GCM. 사이트(js/notion.js)가 WebCrypto 로 푼다.
"""
import base64
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ROOT = Path(__file__).resolve().parent.parent
PRIV = ROOT / "data" / "private"
OUT = ROOT / "data" / "notion.enc.json"
ITER = 210000
KST = timezone(timedelta(hours=9))


def b64(b):
    return base64.b64encode(b).decode()


def main():
    key = os.environ.get("NOTION_SYNC_KEY", "").strip()
    if not key:
        sys.exit("NOTION_SYNC_KEY 가 없다.")
    plan_md = PRIV / "notion-plan.md"
    plan_json = PRIV / "study-hub-plan.json"
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build_plan.py"), str(plan_md), str(plan_json)], check=True)
    plan = json.loads(plan_json.read_text(encoding="utf-8"))["plan"]
    scope_p = PRIV / "notion-scope.json"
    scope = json.loads(scope_p.read_text(encoding="utf-8")) if scope_p.exists() else []
    exam_p = PRIV / "notion-exam.md"
    exam_md = exam_p.read_text(encoding="utf-8").strip() if exam_p.exists() else ""

    body = {"plan": plan, "scope": scope, "exam_md": exam_md}
    plain = json.dumps(body, ensure_ascii=False, sort_keys=True)
    h = hashlib.sha256(plain.encode()).hexdigest()[:16]
    if OUT.exists():
        try:
            if json.loads(OUT.read_text(encoding="utf-8")).get("h") == h:
                print("unchanged")
                return
        except Exception:
            pass

    generated = datetime.now(KST).isoformat(timespec="minutes")
    payload = json.dumps({**body, "generated": generated}, ensure_ascii=False).encode()
    salt, iv = os.urandom(16), os.urandom(12)
    k = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(key.encode())
    ct = AESGCM(k).encrypt(iv, payload, None)
    OUT.write_text(json.dumps({"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITER, "salt": b64(salt), "iv": b64(iv),
                               "ct": b64(ct), "h": h, "generated": generated}) + "\n", encoding="utf-8")
    n = sum(len(g.get("items", [])) for w in plan.get("weeks", []) for g in w.get("groups", []))
    print(f"changed: 주 {len(plan.get('weeks', []))}개, 할 일 {n}개, 범위 {len(scope)}줄 → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
