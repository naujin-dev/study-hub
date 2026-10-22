# 자료 형식 (study-hub/1)

사이트가 읽는 공부자료 JSON 형식이다. 단원 하나가 파일 하나(자료 묶음 하나)다.

## 자료 묶음

```json
{
  "format": "study-hub/1",
  "id": "his-02-modern-reform",
  "subject": "his",
  "unit": "Ⅱ. 근대 국민 국가 수립 운동",
  "title": "흥선 대원군의 정책과 개항",
  "order": 2,
  "updated": "2026-10-22T21:00:00+09:00",
  "summary": "한 줄 요약",
  "notes": "마크다운 본문",
  "cards": [ ... ],
  "questions": [ ... ]
}
```

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `format` | O | 항상 `"study-hub/1"` |
| `id` | O | 영어 소문자, 숫자, `-` 만. 전체 자료에서 겹치면 안 된다. 한 번 정하면 바꾸지 않는다 (바꾸면 푼 기록이 끊긴다) |
| `subject` | O | `kor` 국어, `eng` 영어, `soc` 통합사회, `sci` 통합과학, `his` 한국사, `lab` 과학탐구실험, `jpn` 일본어 |
| `title` | O | 목록에 보이는 이름 |
| `unit` | | 교과서 단원명 |
| `order` | | 과목 안에서 보일 순서 (숫자) |
| `updated` | | 고친 시각. 같은 id 의 자료가 두 곳에 있으면 더 늦은 쪽을 쓴다 |
| `summary` | | 맨 위에 보이는 한두 문장 |
| `notes` | | 본문. 마크다운(GFM): 제목 `##`, 표, 목록, 굵게, 인용 `>`, `<mark>강조</mark>`. LaTeX 는 안 된다. 수식은 `v = s/t`, `H₂O` 처럼 쓴다 |
| `cards` | | 암기카드 배열 |
| `questions` | | 문제 배열 |

## 암기카드

```json
{ "id": "c1", "front": "강화도 조약 체결 연도", "back": "1876년", "note": "선택. 뒷면 아래에 작게 보인다" }
```

`id` 는 자료 안에서 겹치지 않게 쓰고, 바꾸지 않는다.

## 문제

모든 문제에 들어가는 필드:

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `id` | O | 자료 안에서 겹치지 않는 문자열. 바꾸지 않는다 |
| `type` | O | `mcq` 객관식, `short` 단답형, `essay` 서술형 |
| `question` | O | 발문 |
| `context` | | 지문, 보기, 자료. 줄바꿈은 `\n` |
| `explanation` | | 해설 |
| `difficulty` | | 1 쉬움, 2 보통, 3 어려움 |
| `source` | | 근거 (예: "교과서 54쪽", "학습지 3번") |

### 객관식 `mcq`

```json
{ "id": "q1", "type": "mcq", "question": "...", "choices": ["①번 내용", "②", "③", "④", "⑤"], "answer": 3, "explanation": "..." }
```

- `choices`: 보기 문자열 배열. 앞에 ①② 번호를 붙이지 않는다 (사이트가 붙인다).
- `answer`: 정답 번호. **1부터 센다.** 답이 둘 이상이면 `[2, 4]`.

### 단답형 `short`

```json
{ "id": "q2", "type": "short", "question": "...", "answers": ["흥선 대원군", "흥선대원군", "이하응"] }
```

- `answers`: 정답으로 인정할 답 모두. 띄어쓰기와 문장부호는 사이트가 무시하고 비교한다. 그래도 다르게 쓸 수 있는 표기(한자, 약어, 다른 이름)는 넣는다.
- 목록에 없는 답은 API 키가 있으면 AI 가 뜻이 같은지 다시 본다.

### 서술형 `essay`

```json
{
  "id": "q3", "type": "essay",
  "question": "...",
  "rubric": [
    { "criterion": "통상 수교 거부 정책의 배경(서양 세력의 접근)을 쓴 경우", "points": 2 },
    { "criterion": "척화비 건립 등 구체적 사례를 쓴 경우", "points": 2 },
    { "criterion": "결과(근대화 지연)를 평가한 경우", "points": 2 }
  ],
  "model_answer": "만점 답안",
  "limit": "선택. 예: 2문장 이내"
}
```

- `rubric`: 채점 기준. 항목마다 점수를 따로 준다. 배점 합이 문제 점수다.
- `model_answer`: 기준을 모두 채운 답안.

## 여러 자료를 한 번에

```json
{
  "format": "study-hub/1",
  "packs": [ { 자료 }, { 자료 } ],
  "exam": { "subjects": { "his": { "date": null, "range": "Ⅱ-1 ~ Ⅱ-3" } } }
}
```

`exam` 은 선택이다. 들어 있으면 사이트의 과목별 시험 날짜·범위에 반영된다.

## 저장소에 둘 때

- 위치: `data/packs/<과목>/<id>.json` (예: `data/packs/his/his-02-modern-reform.json`)
- 시험 정보: `data/exam.json`
- 올린 뒤 `python3 scripts/check_packs.py` 를 돌리면 검사하고 `data/index.json` 을 다시 만든다. 안 돌리고 올려도 GitHub Actions 가 대신 한다.
