# 일비서

아버지 전용 헤드헌팅 **할 일·일정 개인 비서** (로그인·다중 사용자 없음).  
엑셀 「할 일 계획 및 정리 방법」 규칙을 웹·홈 화면 앱처럼 쓸 수 있게 옮긴 도구입니다.

## 목표 형태

입력된 일정·할 일 → **매일 정해진 시각** → 메일/문자/메신저로 **중요도 순 브리핑** → 같은 내용을 **엑셀로 저장**.  
(발송 시각·채널·엑셀 보관 위치는 아직 미확정)

## 지금 되는 것

- 엑셀형 TO DO 그리드, 스팟→지속→언젠가 정렬·유사 묶음, 완료 기록
- 메모 / OCR(mock) / 캘린더 mock·ICS·JSON, `localStorage` + **PWA**
- **오늘 브리핑** 미리보기 + 「지금 생성」
- 희망 발송 시각 설정 (기본 07:30, 로컬 표시용 — 실제 cron 없음)
- **엑셀(.xlsx) 다운로드** (오늘 브리핑 / 브리핑 요약 / 완료 기록 시트)
- `POST /api/daily-briefing` 스케줄러 뼈대 (dry-run: JSON + xlsx base64, **실제 메일 미발송**)

## 아직 대기 (확정 후 연결)

- 매일 발송 **시각**
- 알림 **채널** (메일 권장 / 문자 / 카카오 등)
- 엑셀 **보관 위치** (메일 첨부 vs 드라이브 누적)
- 실 Google Calendar OAuth / 실 OCR / 기기 간 동기화

## 로컬 실행

```bash
npm install
npm run build && npm run start   # http://127.0.0.1:4317
# 개발: npm run dev
```

### 스케줄러 dry-run 예시

```bash
curl -s -X POST http://127.0.0.1:4317/api/daily-briefing \
  -H 'Content-Type: application/json' \
  -d '{"tasks":[],"send":false}'
```

## 배포

```bash
npx vercel --prod
# 또는 익명 임시: npx vercel deploy --temporary
```

## 아버지 설치 (PWA)

- **iPhone**: Safari → 공유 → 홈 화면에 추가  
- **Android**: Chrome ⋮ → 앱 설치 / 홈 화면에 추가  

## 스택

Next.js · TypeScript · Tailwind · shadcn/ui · ExcelJS · PWA
