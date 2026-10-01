import { NextResponse } from "next/server";
import { buildDailyBriefing } from "@/lib/briefing";
import { buildBriefingWorkbook, briefingFilename } from "@/lib/excel";
import type { Task } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/daily-briefing
 * Body: { tasks: Task[], send?: boolean }
 *
 * Dry-run by default: returns JSON briefing + base64 xlsx.
 * Never sends real email/SMS without credentials — even if send:true,
 * responds with delivery: "skipped_no_credentials".
 *
 * Future cron (example):
 *   curl -X POST "$URL/api/daily-briefing" \
 *     -H "Content-Type: application/json" \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -d @tasks.json
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      tasks?: Task[];
      send?: boolean;
      preferredHour?: string;
    };

    const tasks = Array.isArray(body.tasks) ? body.tasks : [];
    const briefing = buildDailyBriefing(tasks);
    const buffer = await buildBriefingWorkbook(tasks, briefing);
    const base64 = Buffer.from(buffer).toString("base64");
    const filename = briefingFilename(briefing.date);

    const wantsSend = Boolean(body.send);
    const hasMailCreds = Boolean(
      process.env.SMTP_URL || process.env.RESEND_API_KEY,
    );

    let delivery: {
      status: "dry_run" | "skipped_no_credentials" | "not_implemented";
      message: string;
      preferredHour?: string;
    };

    if (!wantsSend) {
      delivery = {
        status: "dry_run",
        message:
          "발송하지 않았습니다. JSON 브리핑과 xlsx(base64)만 반환합니다.",
        preferredHour: body.preferredHour,
      };
    } else if (!hasMailCreds) {
      delivery = {
        status: "skipped_no_credentials",
        message:
          "메일/문자 자격 증명이 없어 실제 발송을 하지 않았습니다. 브리핑·xlsx만 생성했습니다.",
        preferredHour: body.preferredHour,
      };
    } else {
      delivery = {
        status: "not_implemented",
        message:
          "자격 증명은 있으나 채널 연동은 아직 구현되지 않았습니다. dry-run만 수행합니다.",
        preferredHour: body.preferredHour,
      };
    }

    return NextResponse.json({
      ok: true,
      mode: "dry_run",
      briefing: {
        date: briefing.date,
        generatedAt: briefing.generatedAt,
        headline: briefing.headline,
        summaryLine: briefing.summaryLine,
        plaintext: briefing.plaintext,
        activeCount: briefing.activeCount,
        completedCount: briefing.completedCount,
        sections: briefing.sections,
      },
      excel: {
        filename,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64,
      },
      delivery,
      schedulerNote:
        "매일 고정 시각 cron은 시각·채널·저장 위치 확정 후 연결합니다. 현재는 이 엔드포인트를 수동/cron이 호출하는 뼈대입니다.",
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "브리핑 생성 실패",
      },
      { status: 400 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/daily-briefing",
    method: "POST",
    description:
      "tasks 배열을 받아 한국어 브리핑 JSON과 xlsx(base64)를 반환합니다. 기본 dry-run.",
    exampleCron:
      "0 30 7 * * * → POST /api/daily-briefing with stored tasks snapshot",
  });
}
