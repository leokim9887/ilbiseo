/** Shared Resend / SMTP mail helpers for daily briefing. */

export function mailFromAddress(): string {
  return (
    process.env.EMAIL_FROM ||
    process.env.MAIL_FROM ||
    "일비서 <onboarding@resend.dev>"
  );
}

export function hasMailTransport(): boolean {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_URL);
}

export function mailTransportLabel(): string {
  if (process.env.RESEND_API_KEY) return "Resend";
  if (process.env.SMTP_URL) return "SMTP";
  return "없음";
}

export async function sendBriefingEmail(opts: {
  to: string;
  subject: string;
  text: string;
  filename: string;
  xlsxBase64: string;
  attachXlsx?: boolean;
}): Promise<{ sent: boolean; detail: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  const from = mailFromAddress();
  const attach = opts.attachXlsx !== false;

  if (resendKey) {
    const payload: Record<string, unknown> = {
      from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
    };
    if (attach) {
      payload.attachments = [
        {
          filename: opts.filename,
          content: opts.xlsxBase64,
        },
      ];
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        sent: false,
        detail: `Resend 오류(${res.status}): ${body.slice(0, 240)}`,
      };
    }
    return { sent: true, detail: "Resend로 메일을 보냈습니다." };
  }

  if (process.env.SMTP_URL) {
    return {
      sent: false,
      detail:
        "SMTP_URL은 설정되어 있으나 현재는 Resend(RESEND_API_KEY)만 지원합니다. Resend 키를 넣어 주세요.",
    };
  }

  return {
    sent: false,
    detail:
      "메일 키가 없습니다. RESEND_API_KEY와 EMAIL_FROM(또는 MAIL_FROM)을 설정하세요.",
  };
}

export function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Local / unconfigured: allow only when not on Vercel production
    if (process.env.VERCEL === "1") return false;
    return true;
  }
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}
