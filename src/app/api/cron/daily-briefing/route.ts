import { NextResponse } from "next/server";
import { buildDailyBriefing } from "@/lib/briefing";
import { loadBriefingSnapshot, snapshotStoreMode } from "@/lib/briefing-store";
import { buildWorkbook, briefingFilename } from "@/lib/excel";
import {
  authorizeCron,
  hasMailTransport,
  mailTransportLabel,
  sendBriefingEmail,
} from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runCron(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "권한이 없습니다. CRON_SECRET을 Bearer 토큰 또는 ?secret= 으로 보내세요.",
      },
      { status: 401 },
    );
  }

  const snapshot = await loadBriefingSnapshot();
  if (!snapshot) {
    return NextResponse.json({
      ok: false,
      error:
        "저장된 브리핑 스냅샷이 없습니다. 앱에서 매일 발송을 켠 뒤 한 번 열어 동기화하세요.",
      storeMode: snapshotStoreMode(),
    });
  }

  if (!snapshot.dailyEmailEnabled) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "매일 발송이 꺼져 있습니다.",
      updatedAt: snapshot.updatedAt,
    });
  }

  const email = snapshot.workEmail.trim();
  if (!email) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "업무용 이메일이 비어 있습니다.",
      updatedAt: snapshot.updatedAt,
    });
  }

  if (!hasMailTransport()) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      delivery: {
        status: "skipped_no_credentials",
        message:
          "RESEND_API_KEY가 없어 발송하지 않았습니다. (가짜 발송 없음)",
        transport: mailTransportLabel(),
      },
      updatedAt: snapshot.updatedAt,
    });
  }

  const briefing = buildDailyBriefing(
    snapshot.tasks,
    snapshot.calendarEvents,
    undefined,
    snapshot.guidelines,
    snapshot.habits,
  );
  const buffer = await buildWorkbook({
    tasks: snapshot.tasks,
    calendarEvents: snapshot.calendarEvents,
    briefing,
    guidelines: snapshot.guidelines,
    habits: snapshot.habits,
  });
  const base64 = Buffer.from(buffer).toString("base64");
  const filename = briefingFilename(briefing.date);

  const result = await sendBriefingEmail({
    to: email,
    subject: briefing.headline,
    text: briefing.plaintext,
    filename,
    xlsxBase64: base64,
    attachXlsx: snapshot.attachXlsx,
  });

  return NextResponse.json({
    ok: result.sent,
    mode: "cron",
    delivery: {
      status: result.sent ? "sent" : "send_failed",
      message: result.detail,
      transport: mailTransportLabel(),
      to: email,
    },
    briefing: {
      date: briefing.date,
      headline: briefing.headline,
      summaryLine: briefing.summaryLine,
    },
    excel: { filename, attached: snapshot.attachXlsx },
    updatedAt: snapshot.updatedAt,
    storeMode: snapshotStoreMode(),
  });
}

/** Vercel Cron: 0 23 * * * UTC = 08:00 Asia/Seoul */
export async function GET(request: Request) {
  return runCron(request);
}

export async function POST(request: Request) {
  return runCron(request);
}
