import { NextResponse } from "next/server";
import { clearTokenCookie } from "@/lib/google-session";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  await clearTokenCookie(res);
  return res;
}
