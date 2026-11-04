# 외부 라이브러리

CDN 이 막혀도 돌아가게 사이트 안에 넣어 둔 파일. 직접 고치지 않는다.

| 파일 | 원본 | 라이선스 |
| --- | --- | --- |
| `marked-12.0.2.min.js` | npm `marked@12.0.2` | MIT |
| `purify-3.1.6.min.js` | npm `dompurify@3.1.6` | Apache-2.0 / MPL-2.0 |

SDK 다시 묶기:

```bash
npm install @anthropic-ai/sdk@<버전> esbuild
echo "export { default } from '@anthropic-ai/sdk';" > entry.js
```
