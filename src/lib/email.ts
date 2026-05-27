// Transactional email via Resend.
//
// Resend is in package.json but RESEND_API_KEY may not be set yet — every
// caller of this module gets a `{ sent, reason? }` result so the UI can
// fall back to "copy these credentials manually" when email isn't
// configured. We never throw on missing config — the action that needs
// to ship credentials always succeeds at creating the user; email is a
// best-effort side-effect.
//
// Sender: defaults to `onboarding@resend.dev`, which Resend provides for
// free without domain verification. Set EMAIL_FROM (e.g. "Task Manager
// <hello@yourdomain.com>") once you've verified a real sender domain.

import { Resend } from "resend";

const FROM_DEFAULT = "Task Management <onboarding@resend.dev>";

let cached: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (cached) return cached;
  cached = new Resend(key);
  return cached;
}

export type EmailResult =
  | { sent: true; id?: string }
  | { sent: false; reason: string };

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

async function send(args: SendArgs): Promise<EmailResult> {
  const client = getClient();
  if (!client) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }
  const from = process.env.EMAIL_FROM || FROM_DEFAULT;
  try {
    const res = await client.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (res.error) {
      return { sent: false, reason: res.error.message };
    }
    return { sent: true, id: res.data?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown send error";
    return { sent: false, reason: msg };
  }
}

// ─── Welcome / credentials email ───────────────────────────────────────────

export type WelcomeEmailInput = {
  to: string;
  name: string;
  familyName: string;
  password: string;
  loginUrl: string;
};

export async function sendWelcomeCredentialsEmail(
  args: WelcomeEmailInput,
): Promise<EmailResult> {
  const subject = `Your ${args.familyName} account is ready`;
  // Plain-text fallback for clients that hide HTML. Keep it short and
  // unambiguous — passwords with spaces or punctuation can be mangled if
  // we don't surround them with code-fence-style markers.
  const text = [
    `Hi ${args.name},`,
    ``,
    `An account has been created for you on Task Management.`,
    ``,
    `Sign in here: ${args.loginUrl}`,
    ``,
    `Email:    ${args.to}`,
    `Password: ${args.password}`,
    ``,
    `Please change this password after your first sign-in (Profile → Change password).`,
    ``,
    `— Task Management`,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:520px;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
        <tr><td style="padding:32px 32px 8px 32px;">
          <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:600;">
            Welcome to ${escapeHtml(args.familyName)}
          </h1>
          <p style="margin:0;color:#666;font-size:14px;line-height:1.5;">
            Hi ${escapeHtml(args.name)}, an account has been created for you.
            Use the credentials below to sign in.
          </p>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <div style="background:#f5f5f7;border-radius:8px;padding:16px;font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,monospace;font-size:13px;line-height:1.7;">
            <div><span style="color:#888;">Email:&nbsp;&nbsp;&nbsp;</span><strong>${escapeHtml(args.to)}</strong></div>
            <div><span style="color:#888;">Password:</span> <strong>${escapeHtml(args.password)}</strong></div>
          </div>
          <p style="margin:16px 0 0 0;color:#666;font-size:13px;line-height:1.5;">
            For your security, please change this password after your first
            sign-in from <em>Profile → Change password</em>.
          </p>
        </td></tr>
        <tr><td style="padding:8px 32px 32px 32px;" align="left">
          <a href="${args.loginUrl}"
             style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:500;">
            Sign in
          </a>
          <p style="margin:16px 0 0 0;color:#999;font-size:12px;line-height:1.4;word-break:break-all;">
            Or open this link directly:<br>${escapeHtml(args.loginUrl)}
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0 0;color:#aaa;font-size:11px;">
        — Task Management
      </p>
    </td></tr>
  </table>
</body></html>`;

  return send({ to: args.to, subject, html, text });
}

// Minimal HTML-entity escape so a name or email containing < > & " '
// can't break out of the markup. We do NOT use the DOM parser — this
// runs server-side on the edge / Node runtime.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
