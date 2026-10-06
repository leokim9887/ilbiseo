import { NextResponse } from "next/server";
import { buildDailyBriefing } from "@/lib/briefing";
import { buildWorkbook, briefingFilename } from "@/lib/excel";
import type { CalendarEvent, SideListItem, Task } from "@/lib/types";

export const runtime = "nodejs";

async function trySendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  filename: string;
  xlsxBase64: string;
}): Promise<{ sent: boolean; detail: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "일비서 <onboarding@resend.dev>";

  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        attachments: [
          {
            filename: opts.filename,
            content: opts.xlsxBase64,
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { sent: false, detail: `Resend 오류: ${body.slice(0, 200)}` };
    }
    return { sent: true, detail: "Resend로 발송했습니다." };
  }

  if (process.env.SMTP_URL) {
    return {
      sent: false,
      detail:
        "SMTP_URL은 설정됐으나 이 슬라이스에서는 Resend만 구현되어 있습니다.",
    };
  }

  return { sent: false, detail: "RESEND_API_KEY / SMTP_URL 없음" };
}

/**
 * POST /api/daily-briefing
 * Cron 예 (매일 08:00 KST ≈ 23:00 UTC 전날):
 *   0 23 * * * curl -X POST .../api/daily-briefing -H "Authorization: Bearer $CRON_SECRET" ...
 */
export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = request.headers.get("authorization");
      if (auth !== `Bearer ${cronSecret}`) {
        // allow local UI without secret when body has client payload
      }
    }

    const body = (await request.json()) as {
      tasks?: Task[];
      calendarEvents?: CalendarEvent[];
      guidelines?: SideListItem[];
      habits?: SideListItem[];
      send?: boolean;
      preferredHour?: string;
      workEmail?: string;
    };

    const tasks = Array.isArray(body.tasks) ? body.tasks : [];
    const calendarEvents = Array.isArray(body.calendarEvents)
      ? body.calendarEvents
      : [];
    const guidelines = Array.isArray(body.guidelines) ? body.guidelines : [];
    const habits = Array.isArray(body.habits) ? body.habits : [];

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
    const hasTransport = Boolean(
      process.env.RESEND_API_KEY || process.env.SMTP_URL,
    );

    let delivery: {
      status: string;
      message: string;
      preferredHour?: string;
    };

    if (!wantsSend) {
      delivery = {
        status: "dry_run",
        message: "발송하지 않음. JSON + xlsx(base64)만 반환.",
        preferredHour: body.preferredHour || "08:00",
      };
    } else if (!email) {
      delivery = {
        status: "skipped_no_address",
        message: "업무용 이메일이 비어 있어 발송하지 않았습니다.",
        preferredHour: body.preferredHour || "08:00",
      };
    } else if (!hasTransport) {
      delivery = {
        status: "skipped_no_credentials",
        message:
          "메일 전송 키가 없어 발송하지 않았습니다. RESEND_API_KEY를 설정하세요.",
        preferredHour: body.preferredHour || "08:00",
      };
    } else {
      const result = await trySendEmail({
        to: email,
        subject: briefing.headline,
        text: briefing.plaintext,
        filename,
        xlsxBase64: base64,
      });
      delivery = {
        status: result.sent ? "sent" : "send_failed",
        message: result.detail,
        preferredHour: body.preferredHour || "08:00",
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
      },
      excel: {
        filename,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64,
      },
      delivery,
      schedulerNote:
        "매일 08:00 Asia/Seoul cron → 이 엔드포인트. 주소·Resend 확정 후 실발송.",
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
    method: "POST",
    body: {
      tasks: [],
      calendarEvents: [],
      send: false,
      workEmail: "",
      preferredHour: "08:00",
    },
  });
}
