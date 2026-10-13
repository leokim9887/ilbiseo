import nodemailer from "nodemailer";
import { FATHER_EMAIL, FATHER_FROM } from "@/lib/father-mail";

export { FATHER_EMAIL, FATHER_FROM };

function naverSmtpPassword(): string {
  return (
    process.env.NAVER_SMTP_PASSWORD ||
    process.env.SMTP_PASS ||
    process.env.SMTP_PASSWORD ||
    ""
  ).trim();
}

export function mailFromAddress(): string {
  return process.env.EMAIL_FROM || process.env.MAIL_FROM || FATHER_FROM;
}

function resendFallbackAllowed(): boolean {
  return (
    process.env.ALLOW_RESEND_FALLBACK === "1" &&
    Boolean(process.env.RESEND_API_KEY)
  );
}

export function hasMailTransport(): boolean {
  return Boolean(naverSmtpPassword() || resendFallbackAllowed());
}

export function mailTransportLabel(): string {
  if (naverSmtpPassword()) return "네이버 SMTP";
  if (resendFallbackAllowed()) return "Resend(보조)";
  return "없음";
}

async function sendViaNaverSmtp(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  filename: string;
  xlsxBase64: string;
  attachXlsx: boolean;
}): Promise<{ sent: boolean; detail: string }> {
  const pass = naverSmtpPassword();
  if (!pass) {
    return {
      sent: false,
      detail:
        "네이버 앱 비밀번호가 없습니다. 서버 환경 변수 NAVER_SMTP_PASSWORD(또는 SMTP_PASS)에 네이버 메일 애플리케이션 비밀번호를 넣으세요. (가짜 발송 없음)",
    };
  }

  const port = Number(process.env.NAVER_SMTP_PORT || "465");
  const secure = port === 465;
  const transporter = nodemailer.createTransport({
    host: process.env.NAVER_SMTP_HOST || "smtp.naver.com",
    port,
    secure,
    auth: {
      user: process.env.NAVER_SMTP_USER || FATHER_EMAIL,
      pass,
    },
  });

  try {
    await transporter.sendMail({
      from: mailFromAddress(),
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      ...(opts.html ? { html: opts.html } : {}),
      attachments: opts.attachXlsx
        ? [
            {
              filename: opts.filename,
              content: Buffer.from(opts.xlsxBase64, "base64"),
              contentType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          ]
        : [],
    });
    return {
      sent: true,
      detail: "네이버 SMTP로 메일을 보냈습니다.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      sent: false,
      detail: `네이버 SMTP 오류: ${msg.slice(0, 280)}`,
    };
  }
}

async function sendViaResendFallback(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  filename: string;
  xlsxBase64: string;
  attachXlsx: boolean;
}): Promise<{ sent: boolean; detail: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return { sent: false, detail: "Resend 키가 없습니다." };
  }
  const payload: Record<string, unknown> = {
    from: mailFromAddress(),
    to: [opts.to],
    subject: opts.subject,
    text: opts.text,
  };
  if (opts.html) payload.html = opts.html;
  if (opts.attachXlsx) {
    payload.attachments = [
      { filename: opts.filename, content: opts.xlsxBase64 },
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
  return { sent: true, detail: "Resend(보조)로 메일을 보냈습니다." };
}

export async function sendBriefingEmail(opts: {
  to?: string;
  subject: string;
  text: string;
  html?: string;
  filename: string;
  xlsxBase64: string;
  attachXlsx?: boolean;
}): Promise<{ sent: boolean; detail: string }> {
  const to = (opts.to || FATHER_EMAIL).trim() || FATHER_EMAIL;
  const attachXlsx = opts.attachXlsx !== false;
  const payload = {
    to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    filename: opts.filename,
    xlsxBase64: opts.xlsxBase64,
    attachXlsx,
  };

  // Naver SMTP first (father-only). No silent Resend fallback.
  if (naverSmtpPassword()) {
    return sendViaNaverSmtp(payload);
  }

  if (resendFallbackAllowed()) {
    return sendViaResendFallback(payload);
  }

  return {
    sent: false,
    detail:
      "네이버 앱 비밀번호가 없습니다. NAVER_SMTP_PASSWORD(또는 SMTP_PASS)를 설정하세요. 네이버 메일 → 환경설정 → POP3/IMAP → SMTP·애플리케이션 비밀번호. (가짜 발송 없음)",
  };
}

export function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  const url = new URL(request.url);
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";

  if (secret) {
    if (auth === `Bearer ${secret}`) return true;
    if (url.searchParams.get("secret") === secret) return true;
    return false;
  }

  // CRON_SECRET 미설정: 로컬은 허용. Vercel은 플랫폼 cron 헤더만 허용.
  if (process.env.VERCEL === "1") return isVercelCron;
  return true;
}
