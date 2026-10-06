# 일비서

아버지 전용 할 일·일정 비서 (로그인 없음).  
틀(업무/개인/과제/팀원) · 할 일/한 일(엑셀형 표) · 장부 아래 지침·습관 · 구글 캘린더(별도 틀) · 매일 08:00 브리핑 · PC 엑셀 자동 갱신.

## 노트북에서 테스트

본인 노트북 브라우저로 확인하는 방법입니다. (Cursor Try Live 불필요)

1. **공개 URL (바로 열기)**  
   https://temporary-express-nitrogen-qc9zc7i.vercel.app  
   - 임시 배포(약 1시간). 유지: https://vercel.com/claim-deployment?code=90fac156-63f2-4239-aa59-e54f1b734dc5  
   - 영구: `npx vercel login` 후 `npx vercel --prod`

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

3. **엑셀**: 노트북 Chrome → **설정·엑셀** → 「엑셀 파일 연결」  
4. **구글 캘린더**: **캘린더** 메뉴 (할 일 표와 별도). 키 없으면 mock·ICS. 키 있으면 「Google 캘린더 연결」. 안내: store `docs/google-calendar-setup.md`  
5. **08:00 메일**: 업무 이메일 + `RESEND_API_KEY` 필요 (없으면 dry-run만)

## 아버지용 빠른 안내

### 1) PC에서 엑셀 자동 갱신
1. **아버지 노트북/PC**에서 Chrome으로 일비서를 연다.  
2. **설정·엑셀** → **「엑셀 파일 연결」** → 저장할 `.xlsx`를 고른다.  
3. 할 일·한 일을 바꾸면 **같은 파일이 덮어쓰기**된다.  
4. 시트: **할 일** / **한 일** / **구글캘린더** / **브리핑요약**.  
※ File System Access 미지원이면 **지금 저장/다운로드**로 받으세요.

### 2) 할 일 (엑셀형)
- 표에서 제목·종류·기일·중요·시급·메모를 바로 고칩니다.  
- 「행 추가」로 새 줄 · 완료 체크 시 **한 일**로 이동.
- 중요도·시급성: **1~3**

### 3) 구글 캘린더 (할 일과 분리)
- **캘린더** 메뉴에서만 봅니다. 엑셀 6열 표에 넣지 않습니다.  
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` 설정 후 「Google 캘린더 연결」  
- 없으면 **mock 샘플** 또는 **ICS**로 확인.  
- 자세한 단계: `/cursor/stores/self/docs/google-calendar-setup.md`

### 4) 매일 08:00 이메일 브리핑
1. **오늘 브리핑**에서 업무용 이메일을 넣는다.  
2. 기본 **08:00** · `RESEND_API_KEY` 있으면 실발송, 없으면 dry-run.  
3. 캘린더 일정이 있으면 **【구글 캘린더】** 블록이 할 일과 따로 포함됩니다.

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

# 브리핑 메일 (선택)
RESEND_API_KEY=re_xxx
MAIL_FROM="일비서 <you@domain.com>"
CRON_SECRET=optional
```

## 지금 되는 것 / 대기

| 되는 것 | 대기(아버지 확정·키) |
|--------|---------------------|
| 4틀 + 구글 캘린더 틀 + 장부 아래 지침·습관 + 기간필터 + 중요 1–3 | 업무 이메일 주소 |
| 캘린더 별도 패널 + OAuth 코드 경로 + mock/ICS | Google Cloud에 키 넣고 실연결 |
| 브리핑 【구글 캘린더】 분리 블록 · xlsx · API dry-run | Resend로 08:00 실발송 |
| PC 엑셀 연결(브라우저 FS Access) | 아버지 PC에서 연결 |

## 스택

Next.js · TypeScript · Tailwind · shadcn/ui · ExcelJS · PWA · Google Calendar OAuth
