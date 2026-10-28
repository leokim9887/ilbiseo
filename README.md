# 일비서

아버지 전용 할 일·일정 비서 (로그인 없음).  
틀(업무/개인/과제/팀원) · 할 일/한 일(엑셀형 표) · 장부 아래 지침·습관 · 구글 캘린더(별도 틀) · 매일 08:00 브리핑 · PC 엑셀 자동 갱신.

## 노트북에서 테스트

본인 노트북 브라우저로 확인하는 방법입니다. (Cursor Try Live 불필요)

1. **공개 URL (프로덕션 · 고정)**  
   https://fleet-nitrogen-6wxfp18.vercel.app  
   - GCal redirect: `https://fleet-nitrogen-6wxfp18.vercel.app/api/google/callback`  
   - 배포는 **이 Vercel 프로젝트에만**. 새 `temporary-*` URL 금지.  
   - **자동 배포:** GitHub를 Vercel 프로젝트에 연결하면 `main` push → Production.  
     안내: store `docs/auto-deploy.md` · [DEPLOY_TARGET.md](./DEPLOY_TARGET.md) · `docs/production-url.md`

2. **zip으로 로컬 실행**  
   - 파일: Project store `docs/ilbiseo-laptop.zip`  
     (`/cursor/stores/self/docs/ilbiseo-laptop.zip`)  
   - 안내: `/cursor/stores/self/docs/laptop-test.md`  
   - 명령:

```bash
npm install
npm run build
npm run start -- -p 4317
# → http://127.0.0.1:4317
```

3. **엑셀**: 노트북 Chrome·Edge → **오늘 브리핑** 또는 **설정·엑셀** → 「엑셀 파일 저장」  
4. **구글 캘린더**: **캘린더** 메뉴 (할 일 표와 별도). 키 없으면 mock·ICS. 키 있으면 「Google 캘린더 연결」. 안내: store `docs/google-calendar-setup.md`  
5. **08:00 메일**: **오늘 브리핑**에서 이메일·매일 발송·테스트 메일. 안내: store `docs/daily-email-briefing.md`

## 아버지용 빠른 안내

### 1) PC에서 엑셀 같은 파일에 저장
1. **아버지 노트북/PC**에서 Chrome 또는 Edge로 일비서를 연다.  
2. **오늘 브리핑**(또는 **설정·엑셀**) → **「엑셀 파일 저장」** → 처음에는 위치·이름을 고른다.  
3. 그다음부터 같은 버튼을 누르면 **같은 파일을 덮어쓴다** (토스트: 「기존 파일에 저장했습니다」). 저장 창이 다시 뜨면 안 됩니다. 파일이 엑셀에서 열려 있으면 닫고 다시 저장하세요.  
4. 새 위치가 필요하면 **「다른 이름으로 저장」**.  
5. 할 일·한 일을 바꿔도 연결돼 있으면 자동으로 같은 파일이 갱신된다.  
6. 시트: **할 일** / **한 일** / **구글캘린더** / **브리핑요약**.  
※ Safari·모바일 등은 덮어쓰기 대신 **다운로드**로 저장됩니다. 덮어쓰기는 PC Chrome·Edge.

### 2) 할 일 (엑셀형)
- 표에서 제목·종류·기일·중요·메모를 바로 고칩니다.  
- 「행 추가」로 새 줄 · 완료 체크 시 **한 일**로 이동.
- 중요도: **1~3** (시급성 열은 제거됨 · 예전 엑셀의 시급 열은 불러오기 시 **무시**)
- **엑셀 불러오기** (툴바): `.xlsx` / `.xls` / `.csv` → 미리보기 후 **기존에 추가**(기본).  
  일비서 양식이면 열 자동 맞춤 · 다른 양식이면 「아빠 열 → 우리 칸」매핑(기억됨).
- **추가 기능** → **음성으로 입력** · **삼성 음성메모**(`.m4a` 등 재생·받아쓰기/글 붙여넣기) · 엑셀 불러오기.  
  삼성 파일 안 자동 받아쓰기는 브라우저가 못 읽음 → 재생하며 받아쓰기 또는 삼성 앱 글 붙여넣기.

### 3) 구글 캘린더 (할 일과 분리)
- **캘린더** 메뉴에서만 봅니다. 엑셀 6열 표에 넣지 않습니다.  
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` 설정 후 「Google 캘린더 연결」  
- 없으면 **mock 샘플** 또는 **ICS**로 확인.  
- 자세한 단계: `/cursor/stores/self/docs/google-calendar-setup.md`

### 4) PC ↔ 폰 동기화
1. **설정·엑셀** → **PC ↔ 폰 동기화** → PC에서 **새 코드 만들기**  
2. 코드 복사 → 폰 같은 화면에서 **이 코드로 연결**  
3. 저장·앱 열 때 자동 맞춤 · **지금 동기화** 버튼  
4. 서버: Upstash Redis (`UPSTASH_REDIS_REST_URL` / `TOKEN`, 브리핑과 동일)  
5. 안내: `/cursor/stores/self/docs/pc-phone-sync.md`

### 5) 매일 08:00 이메일 브리핑 (네이버 SMTP)
1. 수신·발신 고정: `goldage77@naver.com`  
2. 네이버 **애플리케이션 비밀번호** → `NAVER_SMTP_PASSWORD`  
3. **오늘 브리핑** → **테스트 메일 보내기** · 매일 발송 켜기  
4. 단계별: `/cursor/stores/self/docs/daily-email-briefing.md`

## 로컬 실행

```bash
cp .env.example .env.local   # 값 채우기 (선택)
npm install
npm run build && npm run start   # http://127.0.0.1:4317
```

## 환경 변수

```bash
# Google Calendar (실연동)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://127.0.0.1:4317/api/google/callback
TOKEN_ENCRYPTION_SECRET=   # 선택
NEXT_PUBLIC_APP_URL=http://127.0.0.1:4317

# 브리핑 메일 (네이버 SMTP)
NAVER_SMTP_PASSWORD=   # 네이버 앱 비밀번호 — git에 넣지 마세요
EMAIL_FROM="일비서 <goldage77@naver.com>"
CRON_SECRET=long-random
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

크론: `vercel.json` → `0 23 * * *` UTC = 08:00 KST → `/api/cron/daily-briefing`  
(익명 임시 배포에는 cron이 비활성. Claim/프로덕션 배포 후 동작.)

## 지금 되는 것 / 대기

| 되는 것 | 대기 |
|--------|------|
| 4틀 + 구글 캘린더 틀 + 장부 아래 지침·습관 + 기간필터 + 중요 1–3 | — |
| 캘린더 별도 패널 + OAuth 코드 경로 + mock/ICS | Google Cloud 키 |
| 브리핑 UI · 네이버 SMTP 경로 · 스냅샷·cron | `NAVER_SMTP_PASSWORD` + Claim + Upstash |
| PC 엑셀 연결(브라우저 FS Access) | 아버지 PC에서 연결 |

## 스택

Next.js · TypeScript · Tailwind · shadcn/ui · ExcelJS · PWA · Google Calendar OAuth
