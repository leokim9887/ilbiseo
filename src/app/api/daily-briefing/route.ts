import { NextResponse } from "next/server";
import { buildDailyBriefing } from "@/lib/briefing";
import { buildWorkbook, briefingFilename } from "@/lib/excel";
import {
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
    const email = (body.workEmail || "").trim();

    let delivery: {
      status: string;
      message: string;
      preferredHour?: string;
      transport?: string;
    };

    if (!wantsSend) {
      delivery = {
        status: "dry_run",
        message:
          "미리보기만 했습니다. 메일을 보내지 않았습니다. 「테스트 메일 보내기」를 누르면 실발송을 시도합니다.",
        preferredHour: body.preferredHour || "08:00",
        transport: mailTransportLabel(),
      };
    } else if (!email) {
      delivery = {
        status: "skipped_no_address",
        message:
          "업무용 이메일이 비어 있어 발송하지 않았습니다. 주소를 입력해 주세요.",
        preferredHour: body.preferredHour || "08:00",
        transport: mailTransportLabel(),
      };
    } else if (!hasMailTransport()) {
      delivery = {
        status: "skipped_no_credentials",
        message:
          "메일 키가 없어 발송하지 않았습니다. RESEND_API_KEY와 EMAIL_FROM을 서버 환경 변수에 넣으세요. (가짜 발송 없음)",
        preferredHour: body.preferredHour || "08:00",
        transport: mailTransportLabel(),
      };
    } else {
      const result = await sendBriefingEmail({
        to: email,
        subject: briefing.headline,
        text: briefing.plaintext,
        filename,
        xlsxBase64: base64,
        attachXlsx,
      });
      delivery = {
        status: result.sent ? "sent" : "send_failed",
        message: result.detail,
        preferredHour: body.preferredHour || "08:00",
        transport: mailTransportLabel(),
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
    env: ["RESEND_API_KEY", "EMAIL_FROM|MAIL_FROM", "CRON_SECRET"],
  });
}
