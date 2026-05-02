import nodemailer from "nodemailer";

function normalizeOrigin(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/$/, "");
}

function isLocalOrigin(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function getTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const secure = (process.env.SMTP_SECURE ?? "").toLowerCase() === "true" || port === 465;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in .env.",
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export function buildAppDomain(fallbackOrigin = "http://localhost:3000") {
  const requestOrigin = normalizeOrigin(fallbackOrigin);
  if (requestOrigin && !isLocalOrigin(requestOrigin)) {
    return requestOrigin;
  }

  const vercelUrl = normalizeOrigin(process.env.VERCEL_URL);
  const domain =
    normalizeOrigin(process.env.APP_DOMAIN) ||
    normalizeOrigin(process.env.NEXTAUTH_URL) ||
    normalizeOrigin(process.env.AUTH_URL) ||
    (vercelUrl ? `https://${vercelUrl}` : "") ||
    requestOrigin ||
    "http://localhost:3000";

  return domain;
}

export function buildInviteLink(inviteToken: string, fallbackOrigin?: string) {
  return `${buildAppDomain(fallbackOrigin)}/interview/${encodeURIComponent(inviteToken)}`;
}

export async function sendInterviewInvite(
  candidateName: string,
  candidateEmail: string,
  jobTitle: string,
  inviteToken: string,
  fallbackOrigin?: string,
) {
  const link = buildInviteLink(inviteToken, fallbackOrigin);
  const from = process.env.SMTP_FROM ?? "Interview Platform <noreply@example.com>";

  try {
    await getTransport().sendMail({
      from,
      to: candidateEmail,
      subject: `Your Technical Interview Invitation - ${jobTitle}`,
      text: `Hi ${candidateName},

You have been invited to complete a technical interview for the position of ${jobTitle}.

Please use the following link to access your interview:
${link}

Important information:
- You have 30 minutes to complete the interview
- Questions are presented one at a time - you cannot go back
- A working camera and microphone are required
- Use Google Chrome or Microsoft Edge
- This link is valid for 7 days

Good luck!`,
      html: `<p>Hi <strong>${candidateName}</strong>,</p>
<p>You have been invited to complete a technical interview for the position of <strong>${jobTitle}</strong>.</p>
<p><a href="${link}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0">Start Interview</a></p>
<p>Or copy this link: <code>${link}</code></p>
<ul>
  <li>30-minute time limit, one question at a time (no going back)</li>
  <li>Camera and microphone required</li>
  <li>Chrome or Edge required</li>
  <li>Link valid for 7 days</li>
</ul>
<p>Good luck!</p>`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown SMTP error";
    throw new Error(`Failed to send invite email: ${message}`);
  }
}

export async function sendRatingCompleteEmail(
  recruiterEmail: string,
  candidateName: string,
  overallRating: string,
  overallScore: number,
  testId: string,
  fallbackOrigin?: string,
) {
  const domain = buildAppDomain(fallbackOrigin);
  const from = process.env.SMTP_FROM ?? "Interview Platform <noreply@example.com>";
  const score = (overallScore / 2).toFixed(1);

  try {
    await getTransport().sendMail({
      from,
      to: recruiterEmail,
      subject: `AI Rating Complete - ${candidateName}`,
      text: `AI rating is complete for ${candidateName}.\n\nOverall: ${overallRating} (${score}/5)\n\nView results: ${domain}/tests/${testId}`,
      html: `<p>AI rating is complete for <strong>${candidateName}</strong>.</p>
<p>Overall: <strong>${overallRating}</strong> (${score}/5)</p>
<p><a href="${domain}/tests/${testId}">View Results</a></p>`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown SMTP error";
    throw new Error(`Failed to send rating email: ${message}`);
  }
}
