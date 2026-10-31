# Notion 자동 업데이트 (6시간마다)

예약 작업이 이 순서대로 돌린다. 사람이 직접 돌려도 된다.

Notion "School / Exam" 페이지의 주간 계획, 시험 범위 표, 페이지 본문을 읽어 `data/private/` (git 이 무시함) 에 적고,
`scripts/notion_status.py` 로 암호화한 `data/notion.enc.json` 만 저장소에 올린다. 사이트는 설정에 넣은 비밀번호로 이 파일을 풀어
"시험 일정과 계획" 화면과 홈에 보여 준다. 계획 내용은 공개 저장소에 평문으로 올리지 않는다.

## Notion 위치

| 이름 | 주소 |
| --- | --- |
| Exam 페이지 | https://app.notion.com/p/3fdb2bc0f473811cae9cd6b3b484f2a6 |
| Weekly Plan (주간 계획) | collection://3ecf94ba-c0a0-414e-8653-bb26558821e5 |
| Exam Scope (시험 범위) | collection://ad521065-d86f-4891-8da7-4dd101272dd9 |

## 1. Exam 페이지 본문 → `data/private/notion-exam.md`

Exam 페이지를 fetch 해서 `<content>` 안의 글 중 데이터베이스 태그(`<database …>`)를 뺀 나머지를 마크다운 그대로 적는다
(시험 날짜 줄, "하루 공부 시간" 표, "통합사회2 회독 흐름" 표, 그 아래 설명). `\~` 는 `~` 로 바꾼다.

## 2. 시험 범위 → `data/private/notion-scope.json`

Exam Scope 를 SQL 로 읽는다:

```sql
SELECT url, "과목", "범위", "1회독", "2회독", "3회독", "문제 풀이", "메모"
FROM "collection://ad521065-d86f-4891-8da7-4dd101272dd9" ORDER BY "과목", createdTime
```

줄마다 `{"subject": 과목, "range": 범위, "r1": 1회독, "r2": 2회독, "r3": 3회독, "solve": 문제 풀이, "memo": 메모 또는 "", "url": url}`
(체크박스는 `"__YES__"` 이면 true) 로 바꿔 배열로 적는다.

## 3. 주간 계획 → `data/private/notion-plan.md`

Weekly Plan 을 기간 순서로 읽는다:

```sql
SELECT url, "주차", "date:기간:start", "date:기간:end", "단계", "겹치는 일정"
FROM "collection://3ecf94ba-c0a0-414e-8653-bb26558821e5" ORDER BY "date:기간:start"
```

주마다 그 페이지를 fetch 해서 본문을 `scripts/build_plan.py` 맨 위 설명의 모양으로 옮긴다:

```
=== 주차|시작일|끝일|단계|겹치는 일정|Notion 주소
(목록 앞의 메모 줄)
- [ ] 큰 할 일 (과목 이름으로 시작)
  - [ ] 10/20(화) 날짜가 있는 작은 할 일
  - [x] 끝낸 것
```

- 체크 상태(`[x]`)는 Notion 그대로. 할 일 글자는 바꾸지 않는다 (글자가 바뀌면 사이트의 체크 기록이 따로 논다).
- Notion 할 일 목록(`- [ ]`) 이 아닌 표나 문단은 메모 줄로 짧게 옮기거나 뺀다.
- 취소선(`<s>…</s>`)으로 지운 할 일(다른 날로 이월한 것 등)은 옮기지 않는다. 이월된 할 일은 옮겨 간 날에 따로 있다.

## 4. 암호화하고 올리기

```bash
NOTION_SYNC_KEY='비밀번호' python3 scripts/notion_status.py
```

- `unchanged` 가 나오면 할 일 없음. 끝.
- `changed …` 가 나오면 `data/notion.enc.json` 만 커밋해서 main 에 푸시한다. 커밋 메시지: `Notion 계획 업데이트 (YYYY-MM-DD HH:MM)`.
- `data/private/` 는 절대 커밋하지 않는다. `scripts/bump_version.py` 는 돌리지 않는다 (사이트 코드가 아니라서).

비밀번호는 예약 작업 설정에만 있다. 저장소, 커밋 메시지, 로그에 쓰지 않는다.
