# 일비서

아버지 전용 할 일·일정 비서 (로그인 없음).  
네 틀(업무/개인/과제/팀원) · 할 일/한 일(엑셀형 표) · 구글 캘린더(별도) · 매일 08:00 브리핑 · PC 엑셀 자동 갱신.

## 노트북에서 테스트

본인 노트북 브라우저로 확인하는 방법입니다. (Cursor Try Live 불필요)

1. **공개 URL (바로 열기)**  
   https://temporary-zippy-crimson-7fwqpzg.vercel.app  
   - 임시 배포(약 1시간). 유지: https://vercel.com/claim-deployment?code=62ef6a1d-f685-409d-bbd4-4ac94d278514  
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
4. **08:00 메일**: 업무 이메일 + `RESEND_API_KEY` 필요 (없으면 dry-run만)

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

### 3) 구글 캘린더
- **캘린더** 메뉴는 프로그램 할 일과 섞이지 않습니다.  
- OAuth가 없으면 **mock 샘플** 또는 **ICS**로 확인.

### 4) 매일 08:00 이메일 브리핑
1. **오늘 브리핑**에서 업무용 이메일을 넣는다.  
2. 기본 **08:00** · `RESEND_API_KEY` 있으면 실발송, 없으면 dry-run.  
3. cron: `POST /api/daily-briefing` (tasks·calendarEvents·workEmail·send:true).

## 로컬 실행

```bash
npm install
npm run build && npm run start   # http://127.0.0.1:4317
```

## 환경 변수 (선택)

```bash
RESEND_API_KEY=re_xxx
MAIL_FROM="일비서 <you@domain.com>"
CRON_SECRET=optional
NEXT_PUBLIC_GOOGLE_CLIENT_ID=optional
```

## 지금 되는 것 / 대기

| 되는 것 | 대기(아버지 확정·키) |
|--------|---------------------|
| 4틀 + 할 일/한 일(엑셀형) + 메모 | 업무 이메일 주소 |
| 캘린더 별도 패널 (mock/ICS) | Google OAuth |
| 브리핑 미리보기·xlsx·API dry-run | Resend로 08:00 실발송 |
| PC 엑셀 연결(브라우저 FS Access) | 아버지 PC에서 연결 |

## 스택

Next.js · TypeScript · Tailwind · shadcn/ui · ExcelJS · PWA
