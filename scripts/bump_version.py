#!/usr/bin/env python3
"""사이트 코드를 고친 뒤 커밋 전에 돌린다.

    python3 scripts/bump_version.py

index.html 의 스크립트·스타일 주소에 새 버전 번호(?v=...)를 붙이고 version.json 을 쓴다.
브라우저(특히 홈 화면에 추가한 앱)가 예전 파일을 붙잡고 있지 않고 새 파일을 받게 한다.
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
v = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

mods = sorted(p.name for p in (ROOT / "js").glob("*.js"))
imap = {f"./js/{m}": f"./js/{m}?v={v}" for m in mods}
block = f"""<!-- version:start (scripts/bump_version.py 가 만든다. 직접 고치지 않는다) -->
<script>window.SH_VERSION = "{v}";</script>
<script type="importmap">{json.dumps({"imports": imap}, ensure_ascii=False)}</script>
<link rel="stylesheet" href="css/style.css?v={v}">
<script src="js/vendor/marked-12.0.2.min.js" defer></script>
<script src="js/vendor/purify-3.1.6.min.js" defer></script>
<script type="module" src="js/app.js?v={v}"></script>
<!-- version:end -->"""

html = (ROOT / "index.html").read_text(encoding="utf-8")
if "<!-- version:start" in html:
    html = re.sub(r"<!-- version:start.*?<!-- version:end -->", block, html, flags=re.S)
else:
    for pat in ['<link rel="stylesheet" href="css/style.css">\n', '<script src="js/vendor/marked-12.0.2.min.js" defer></script>\n',
                '<script src="js/vendor/purify-3.1.6.min.js" defer></script>\n', '<script type="module" src="js/app.js"></script>\n']:
        html = html.replace(pat, "")
    html = html.replace("</head>", block + "\n</head>", 1)
(ROOT / "index.html").write_text(html, encoding="utf-8")
(ROOT / "version.json").write_text(json.dumps({"v": v}) + "\n", encoding="utf-8")
print("version", v)
