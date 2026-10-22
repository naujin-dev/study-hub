# 2회고사 공부방

2회고사(2026년 12월 18·21·22일) 준비용 개인 공부 사이트. 공부자료를 모아 읽고, 객관식·단답형·서술형 문제를 풀고, 서술형은 Claude 가 채점한다.

- 사이트: https://naujin-dev.github.io/study-hub/
- 과목: 국어, 영어, 통합사회, 통합과학, 한국사, 과학탐구실험, 일본어

## 기능

| 화면 | 하는 일 |
| --- | --- |
| 홈 | 시험까지 남은 날, 오늘 복습할 문제 수, 오답 수, 오늘 계획, 과목별 하루 목표, 과목별 진도와 정답률, 약한 단원 |
| 자료 | 과목별 단원 목록, 본문 읽기, 전체 검색, 다 읽음 표시, 인쇄, 자료 내용으로 Claude 에게 질문 |
| 문제 | 과목·단원·유형·조건(안 푼 것, 오답, 복습할 때 된 것, 헷갈림 표시)으로 골라 풀기. 연습(바로 채점)과 실전(시간 제한, 끝나고 한꺼번에 채점) |
| 채점 | 객관식 바로 채점. 단답형은 표기 차이를 무시하고 비교하고, 다르면 AI 가 뜻이 같은지 확인. 서술형은 AI 가 기준별 점수, 빠진 점, 고친 답안을 준다 |
| 오답노트 | 틀리거나 부분 점수 받은 문제. 내 답, 정답, AI 피드백, 해설. 두 번 연속 맞히면 빠진다 |
| 복습 | 맞힌 문제는 1·2·4·7·14일 뒤에 다시 나온다 |
| 암기카드 | 뒤집어 보며 외우기. 모른 카드는 그 자리에서 다시 나온다 |
| AI 문제 만들기 | 자료 본문으로 새 문제를 만들어 이 기기에 저장 |
| 일정·계획 | 과목별 시험 날짜·범위, 날짜별 할 일 |
| 기록 | 최근 2주 푼 문제, 과목·단원별 정답률, 25/50분 집중 타이머 |
| 설정 | API 키, 모델, 자료 가져오기, 백업 |

## 처음 한 번 할 일

1. GitHub 저장소 **Settings → Pages** 에서 Source 를 "Deploy from a branch", 브랜치 `main`, 폴더 `/ (root)` 로 저장한다. 1~2분 뒤 사이트 주소가 열린다.
2. **Settings → Actions → General → Workflow permissions** 를 "Read and write permissions" 로 바꾼다. 자료를 올렸을 때 `data/index.json` 을 자동으로 다시 만드는 데 필요하다.
3. 사이트 [설정] 에 Anthropic API 키를 넣는다. 키는 https://console.anthropic.com/settings/keys 에서 만든다. 키 없이도 쓸 수 있지만 서술형은 스스로 채점해야 한다.

## 자료 넣기

공부자료를 만드는 Claude 에게 [PROMPT.md](PROMPT.md) 의 프롬프트를 보낸다.

- 채팅 Claude: 받은 JSON 을 사이트 [설정 → 자료 가져오기] 에 붙여넣는다. 그 기기에만 저장된다.
- Claude Code: `data/packs/<과목>/<id>.json` 으로 올리고 푸시한다. 모든 기기에서 보인다.

형식은 [docs/FORMAT.md](docs/FORMAT.md).

직접 확인하려면:

```bash
python3 scripts/check_packs.py   # 검사, data/index.json 다시 만들기
python3 -m http.server 8000      # http://localhost:8000
```

## 파일

| 파일 | 내용 |
| --- | --- |
| `index.html` | 사이트 전체 (한 페이지) |
| `css/style.css` | 스타일. 라이트/다크 모드 |
| `js/app.js` | 화면 |
| `js/data.js` | 자료 불러오기, 형식 검사 |
| `js/store.js` | 기기에 저장하는 기록 |
| `js/ai.js` | Claude API 호출 (채점, 질문, 문제 만들기) |
| `js/vendor/` | 마크다운, HTML 정리, Anthropic SDK 라이브러리 |
| `data/exam.json` | 시험 날짜와 과목별 범위 |
| `data/packs/` | 공부자료 |
| `data/index.json` | 자료 목록. `scripts/check_packs.py` 가 만든다. 직접 고치지 않는다 |

## 알아둘 것

- 푼 기록, 오답노트, 계획, 가져온 자료, API 키는 그 기기의 브라우저에만 저장된다. 휴대폰과 컴퓨터를 같이 쓰면 [설정 → 백업] 으로 옮긴다. 백업 파일에는 API 키가 들어가지 않는다.
- AI 기능은 브라우저에서 Anthropic 으로 바로 요청한다. 쓴 만큼 API 요금이 나온다. 기본 모델은 Claude Opus 5.5 이고 설정에서 Sonnet 5.5, Haiku 5.5 로 바꿀 수 있다.
- 저장소가 공개라서 `data/packs/` 의 자료는 누구나 볼 수 있다. 남에게 보이면 안 되는 자료는 저장소에 올리지 말고 [자료 가져오기] 로만 넣는다.
