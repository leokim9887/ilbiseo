import { NextResponse } from "next/server";
import { isGoogleConfigured } from "@/lib/google-oauth";
import { readTokenBundle } from "@/lib/google-session";

export const runtime = "nodejs";

export async function GET() {
  const configured = isGoogleConfigured();
  const bundle = configured ? await readTokenBundle() : null;
  return NextResponse.json({
    configured,
    connected: Boolean(bundle?.access_token),
    email: bundle?.email ?? null,
    missing: configured
      ? []
      : ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"].filter(
          (k) => {
            if (k === "GOOGLE_CLIENT_ID") {
              return !(
                process.env.GOOGLE_CLIENT_ID ||
                process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
              );
            }
            return !process.env[k];
          },
        ),
    setupHint:
      "Google 캘린더 연결에 필요한 키가 없습니다. 서버 환경 변수를 확인해 주세요.",
  });
}
