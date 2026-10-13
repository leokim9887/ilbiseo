import { NextResponse } from "next/server";
import { buildDailyBriefing } from "@/lib/briefing";
import { buildWorkbook, briefingFilename } from "@/lib/excel";
import {
  FATHER_EMAIL,
  hasMailTransport,
  mailTransportLabel,
  sendBriefingEmail,
} from "@/lib/mail";
import type { CalendarEvent, SideListItem, Task } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/daily-briefing
 * UI 테스트 발송·미리보기. 매일 크론은 /api/cron/daily-briefing 사용.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      tasks?: Task[];
      calendarEvents?: CalendarEvent[];
      guidelines?: SideListItem[];
      habits?: SideListItem[];
      send?: boolean;
      preferredHour?: string;
      workEmail?: string;
      attachXlsx?: boolean;
    };

    const tasks = Array.isArray(body.tasks) ? body.tasks : [];
    const calendarEvents = Array.isArray(body.calendarEvents)
      ? body.calendarEvents
      : [];
    const guidelines = Array.isArray(body.guidelines) ? body.guidelines : [];
    const habits = Array.isArray(body.habits) ? body.habits : [];
    const attachXlsx = body.attachXlsx !== false;

    const briefing = buildDailyBriefing(
      tasks,
      calendarEvents,
      undefined,
      guidelines,
      habits,
    );
    const buffer = await buildWorkbook({
      tasks,
      calendarEvents,
      briefing,
      guidelines,
      habits,
    });
    const base64 = Buffer.from(buffer).toString("base64");
    const filename = briefingFilename(briefing.date);

    const wantsSend = Boolean(body.send);
    const email = FATHER_EMAIL;

    let delivery: {
      status: string;
      message: string;
      preferredHour?: string;
      transport?: string;
      to?: string;
    };

    if (!wantsSend) {
      delivery = {
        status: "dry_run",
        message:
          "미리보기만 했습니다. 메일을 보내지 않았습니다. 「테스트 메일 보내기」를 누르면 네이버 SMTP로 실발송을 시도합니다.",
        preferredHour: body.preferredHour || "08:00",
        transport: mailTransportLabel(),
        to: email,
      };
    } else if (!hasMailTransport()) {
      delivery = {
        status: "skipped_no_credentials",
        message:
          "네이버 앱 비밀번호가 없어 발송하지 않았습니다. NAVER_SMTP_PASSWORD(또는 SMTP_PASS)를 설정하세요. (가짜 발송 없음)",
        preferredHour: body.preferredHour || "08:00",
        transport: mailTransportLabel(),
        to: email,
      };
    } else {
      const result = await sendBriefingEmail({
        to: email,
        subject: briefing.headline,
        text: briefing.plaintext,
        html: briefing.html,
        filename,
        xlsxBase64: base64,
        attachXlsx,
      });
      delivery = {
        status: result.sent ? "sent" : "send_failed",
        message: result.detail,
        preferredHour: body.preferredHour || "08:00",
        transport: mailTransportLabel(),
        to: email,
      };
    }

    return NextResponse.json({
      ok: true,
      mode: wantsSend ? "send_attempt" : "dry_run",
      briefing: {
        date: briefing.date,
        generatedAt: briefing.generatedAt,
        headline: briefing.headline,
        summaryLine: briefing.summaryLine,
        plaintext: briefing.plaintext,
        html: briefing.html,
        activeCount: briefing.activeCount,
        completedCount: briefing.completedCount,
        sections: briefing.sections,
        calendarLines: briefing.calendarLines,
        guidelineLines: briefing.guidelineLines,
        habitLines: briefing.habitLines,
      },
      excel: {
        filename,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64,
      },
      delivery,
      schedulerNote:
        "매일 08:00 Asia/Seoul → GET/POST /api/cron/daily-briefing (vercel.json cron: 0 23 * * * UTC).",
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
    defaultHourKST: "08:00",
    cronEndpoint: "/api/cron/daily-briefing",
    method: "POST",
    env: [
      "NAVER_SMTP_PASSWORD|SMTP_PASS",
      "CRON_SECRET",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
    ],
    fatherEmail: FATHER_EMAIL,
  });
}
