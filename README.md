# 일비서

아버지 전용 헤드헌팅 **할 일·일정 개인 비서** (로그인·다중 사용자 없음).  
엑셀 「할 일 계획 및 정리 방법」 규칙을 웹·홈 화면 앱처럼 쓸 수 있게 옮긴 도구입니다.

## 기능

- 엑셀형 TO DO 그리드 (추가·수정·삭제·완료)
- 정렬: **스팟(당일)** → **지속(~목표일)** → **언젠가(시급·중요)**, 유사 할일 묶음
- 완료 기록 아카이브
- 메모 붙여넣기 / OCR(mock) / 캘린더 mock·ICS·JSON
- `localStorage` 저장 + **PWA**(홈 화면 추가, 오프라인 셸)

## 로컬 실행

```bash
npm install
npm run dev          # http://127.0.0.1:4317
# 또는 프로덕션
npm run build && npm run start
```

## 배포 (Vercel — 한 줄)

이 환경에는 Vercel 토큰이 없어 여기서 공개 URL을 올리지 못했습니다. 로컬/본인 계정에서:

```bash
npx vercel --prod
```

또는 GitHub/Origin 저장소를 [Vercel](https://vercel.com)에 Import → Framework: Next.js → Deploy.  
`vercel.json`과 `next.config.ts`에 Service Worker·매니페스트 헤더가 포함되어 있습니다.

배포 후 아버지 폰에서 HTTPS URL을 열고 아래처럼 홈 화면에 추가하면 됩니다.

## 아버지 설치 방법

### iPhone / iPad (Safari)
1. Safari로 일비서 주소를 연다  
2. 하단 **공유** 버튼 탭  
3. **홈 화면에 추가** → 추가  

### Android (Chrome)
1. Chrome으로 일비서 주소를 연다  
2. 메뉴(⋮) → **앱 설치** 또는 **홈 화면에 추가**  
3. (안내 배너의 **설치**가 보이면 그걸로도 가능)

설치 후 아이콘으로 열면 전체 화면(앱처럼)으로 동작하고, 할 일 데이터는 **그 기기 브라우저**에 남습니다.

## 스택

Next.js · TypeScript · Tailwind · shadcn/ui · PWA (manifest + service worker)

## 의도적으로 미룸

- Google Calendar OAuth / 실 OCR API  
- 계정·동기화·다중 기기 공유 (현재는 기기 로컬 전용)
