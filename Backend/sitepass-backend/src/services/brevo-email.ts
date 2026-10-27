import { setTimeout as delay } from "node:timers/promises";

type EmailInput = { to: string; subject: string; htmlContent: string; textContent: string };
type BrevoResult = { accepted: boolean; messageId?: string; status: "SENT" | "FAILED"; error?: string };

function config() {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "SITEPASS";
  if (!apiKey || !senderEmail) throw new Error("Brevo email configuration is incomplete.");
  return { apiKey, senderEmail, senderName };
}

function safeError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return message.replace(/api-key\s*[:=]\s*\S+/gi, "api-key: [redacted]").slice(0, 500);
}

export async function sendBrevoEmail(input: EmailInput): Promise<BrevoResult> {
  const { apiKey, senderEmail, senderName } = config();
  let lastError = "Unable to submit email.";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sender: { email: senderEmail, name: senderName }, to: [{ email: input.to }], subject: input.subject, htmlContent: input.htmlContent, textContent: input.textContent }),
        signal: controller.signal,
      });
      const body = await response.text();
      if (response.ok) {
        let parsed: { messageId?: string } = {};
        try { parsed = body ? JSON.parse(body) as { messageId?: string } : {}; } catch { /* Brevo may return an empty accepted response. */ }
        return { accepted: true, status: "SENT", messageId: parsed.messageId };
      }
      let providerMessage = "";
      try { providerMessage = String((JSON.parse(body) as { message?: string }).message || ""); } catch { /* Keep provider errors generic when the body is not JSON. */ }
      lastError = `Brevo rejected the email (${response.status})${providerMessage ? `: ${safeError(providerMessage)}` : "."}`;
      if (response.status < 500 && response.status !== 429) return { accepted: false, status: "FAILED", error: lastError };
      if (attempt < 3) await delay(response.status === 429 ? 1000 * attempt : 500 * attempt);
    } catch (error) {
      lastError = error instanceof Error && error.name === "AbortError" ? "Brevo email request timed out." : safeError(error);
      if (attempt < 3) await delay(500 * attempt);
    } finally { clearTimeout(timeout); }
  }
  return { accepted: false, status: "FAILED", error: lastError };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] || character));
}

function legacyWelcomeEmail(input: { fullName: string; employeeCode: string; accessCode: string; siteName: string }) {
  const fullName = escapeHtml(input.fullName); const employeeCode = escapeHtml(input.employeeCode); const accessCode = escapeHtml(input.accessCode); const siteName = escapeHtml(input.siteName);
  const subject = "Welcome to SITEPASS – Your Employee Access Details";
  const textContent = `Hello ${input.fullName},\n\nWelcome to SITEPASS!\n\nEmployee ID: ${input.employeeCode}\nTemporary Access Code: ${input.accessCode}\nAssigned Construction Site: ${input.siteName}\n\nHow to use SITEPASS:\n1. Visit your assigned construction site.\n2. Scan the official SITEPASS QR code.\n3. Complete GPS verification if required.\n4. Enter your Employee ID and Access Code.\n5. Complete your attendance check-in or check-out.\n\nPlease keep your credentials confidential.\n\nRegards,\nSITEPASS Team`;
  const htmlContent = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#15233d"><div style="background:#102a56;color:#fff;padding:24px;border-radius:12px 12px 0 0"><h1 style="margin:0">SITEPASS</h1><p style="margin:8px 0 0;color:#dbeafe">Employee access details</p></div><div style="padding:28px;border:1px solid #e2e8f0;border-top:0"><p>Hello ${fullName},</p><p>Welcome to SITEPASS. Your employee account has been successfully created.</p><div style="background:#f8fafc;padding:18px;border-radius:10px"><p><strong>Employee ID:</strong> ${employeeCode}</p><p><strong>Temporary Access Code:</strong> ${accessCode}</p><p><strong>Assigned Construction Site:</strong> ${siteName}</p></div><h2 style="color:#102a56">How to use SITEPASS</h2><ol><li>Visit your assigned construction site.</li><li>Scan the official SITEPASS QR code.</li><li>Complete GPS verification if required.</li><li>Enter your Employee ID and Access Code.</li><li>Complete your attendance check-in or check-out.</li></ol><p style="color:#b45309"><strong>Security reminder:</strong> Please keep your access code confidential.</p><p>Regards,<br/>SITEPASS Team</p></div></div>`;
  return { subject, htmlContent, textContent };
}

export function welcomeEmail(input: { fullName: string; employeeCode: string; accessCode: string; siteName: string }) {
  const fullName = escapeHtml(input.fullName);
  const employeeCode = escapeHtml(input.employeeCode);
  const accessCode = escapeHtml(input.accessCode);
  const siteName = escapeHtml(input.siteName);
  const subject = "Welcome to SITEPASS - Your Employee Access Details";
  const textContent = `Hello ${input.fullName},

Welcome to SITEPASS!
Your employee registration has been completed successfully.

Employee ID: ${input.employeeCode}
Temporary Access Code: ${input.accessCode}
Assigned Construction Site: ${input.siteName}

How to use SITEPASS:
1. Visit your assigned construction site.
2. Scan the official SITEPASS QR code.
3. Complete GPS verification if required.
4. Enter your Employee ID and Access Code.
5. Complete attendance check-in or check-out.

Security reminder: Never share your access code. This temporary code may be rotated by an authorized SITEPASS administrator.

SITEPASS Team
This is an automated notification. Please do not reply.`;
  const htmlContent = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Welcome to SITEPASS</title>
<style>@media screen and (max-width:600px){.email-shell{width:100%!important}.email-body{padding:28px 20px!important}.credential-value{font-size:16px!important}}</style></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#172033;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your SITEPASS employee registration and temporary access details.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eef2f7;"><tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" class="email-shell" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 5px 18px rgba(15,23,42,.08);">
      <tr><td style="background:#102a56;padding:30px 34px;color:#fff;"><div style="font-size:25px;line-height:1;font-weight:700;letter-spacing:1.5px;">SITEPASS</div><div style="margin-top:10px;font-size:14px;line-height:20px;color:#dbeafe;">Secure Construction Site Access</div></td></tr>
      <tr><td class="email-body" style="padding:38px 42px 34px;"><p style="margin:0 0 8px;font-size:16px;line-height:24px;color:#475569;">Hello ${fullName},</p><h1 style="margin:0 0 14px;font-size:28px;line-height:36px;color:#102a56;">Welcome to SITEPASS!</h1><p style="margin:0 0 26px;font-size:16px;line-height:26px;color:#475569;">Your employee registration has been completed successfully. Keep the details below private and use them when accessing your assigned construction site.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;border:1px solid #dbe4ef;border-radius:10px;"><tr><td style="padding:20px 22px 8px;font-size:14px;font-weight:700;color:#102a56;">YOUR ACCESS DETAILS</td></tr>
          <tr><td style="padding:8px 22px 16px;border-bottom:1px solid #e2e8f0;"><div style="font-size:12px;line-height:18px;color:#64748b;">Employee ID</div><div class="credential-value" style="margin-top:3px;font-size:18px;line-height:25px;font-weight:700;color:#172033;">${employeeCode}</div></td></tr>
          <tr><td style="padding:16px 22px;border-bottom:1px solid #e2e8f0;"><div style="font-size:12px;line-height:18px;color:#64748b;">Temporary Access Code</div><div class="credential-value" style="margin-top:3px;font-size:18px;line-height:25px;font-weight:700;letter-spacing:1px;color:#172033;word-break:break-word;">${accessCode}</div></td></tr>
          <tr><td style="padding:16px 22px 20px;"><div style="font-size:12px;line-height:18px;color:#64748b;">Assigned Construction Site</div><div class="credential-value" style="margin-top:3px;font-size:17px;line-height:24px;font-weight:700;color:#172033;word-break:break-word;">${siteName}</div></td></tr>
        </table>
        <h2 style="margin:30px 0 14px;font-size:20px;line-height:28px;color:#102a56;">How to use SITEPASS</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td valign="top" style="width:28px;padding:0 0 10px;font-size:15px;line-height:24px;font-weight:700;color:#2563eb;">1.</td><td style="padding:0 0 10px;font-size:15px;line-height:24px;color:#475569;">Visit your assigned construction site.</td></tr><tr><td valign="top" style="width:28px;padding:0 0 10px;font-size:15px;line-height:24px;font-weight:700;color:#2563eb;">2.</td><td style="padding:0 0 10px;font-size:15px;line-height:24px;color:#475569;">Scan the official SITEPASS QR code.</td></tr><tr><td valign="top" style="width:28px;padding:0 0 10px;font-size:15px;line-height:24px;font-weight:700;color:#2563eb;">3.</td><td style="padding:0 0 10px;font-size:15px;line-height:24px;color:#475569;">Complete GPS verification if required.</td></tr><tr><td valign="top" style="width:28px;padding:0 0 10px;font-size:15px;line-height:24px;font-weight:700;color:#2563eb;">4.</td><td style="padding:0 0 10px;font-size:15px;line-height:24px;color:#475569;">Enter your Employee ID and Access Code.</td></tr><tr><td valign="top" style="width:28px;font-size:15px;line-height:24px;font-weight:700;color:#2563eb;">5.</td><td style="font-size:15px;line-height:24px;color:#475569;">Complete attendance check-in or check-out.</td></tr></table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;"><tr><td style="padding:15px 17px;font-size:14px;line-height:22px;color:#9a3412;"><strong>Security reminder:</strong> Never share your access code. This temporary code may be rotated by an authorized SITEPASS administrator.</td></tr></table>
      </td></tr>
      <tr><td style="padding:22px 34px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;"><div style="font-size:14px;line-height:22px;font-weight:700;color:#102a56;">SITEPASS Team</div><div style="margin-top:4px;font-size:12px;line-height:19px;color:#64748b;">This is an automated notification. Please do not reply.</div></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { subject, htmlContent, textContent };
}

export function visitorWelcomeEmail(input: { fullName: string; visitorCode: string; accessCode: string; siteName: string; purpose: string; validUntil: Date; verificationUrl?: string }) {
  const fullName = escapeHtml(input.fullName); const visitorCode = escapeHtml(input.visitorCode); const accessCode = escapeHtml(input.accessCode); const siteName = escapeHtml(input.siteName); const purpose = escapeHtml(input.purpose); const validUntil = escapeHtml(input.validUntil.toISOString()); const verificationUrl = input.verificationUrl ? escapeHtml(input.verificationUrl) : "";
  const subject = "Welcome to SITEPASS – Your Visitor Access Details";
  const verify = verificationUrl ? `\nVerify email ownership (required before check-in): ${input.verificationUrl}\n` : "\nUse the email verification link in this message before check-in.\n";
  const textContent = `Hello ${input.fullName},\n\nYour SITEPASS visitor registration is ready.\n\nVisitor ID: ${input.visitorCode}\nTemporary visitor access code: ${input.accessCode}\nConstruction site: ${input.siteName}\nVisit purpose: ${input.purpose}\nValid until: ${input.validUntil.toISOString()}\n${verify}\nScan the official site QR code, complete GPS verification when enabled, and enter your Visitor ID and access code for check-in and check-out. Never share your credentials.\n\nSITEPASS Team`;
  const htmlContent = `<!doctype html><html><body style="margin:0;background:#eef2f7;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table width="100%" style="max-width:640px;background:#fff;border-radius:14px;overflow:hidden"><tr><td style="background:#102a56;padding:30px;color:#fff"><strong style="font-size:25px;letter-spacing:1.5px">SITEPASS</strong><div style="margin-top:10px;color:#dbeafe">Secure visitor access</div></td></tr><tr><td style="padding:36px"><p>Hello ${fullName},</p><h1 style="color:#102a56">Welcome to SITEPASS</h1><p>Your visitor registration is ready. Keep these details private.</p><div style="background:#f8fafc;padding:18px;border:1px solid #dbe4ef;border-radius:10px"><p><b>Visitor ID:</b> ${visitorCode}</p><p><b>Temporary access code:</b> ${accessCode}</p><p><b>Construction site:</b> ${siteName}</p><p><b>Visit purpose:</b> ${purpose}</p><p><b>Valid until:</b> ${validUntil}</p></div>${verificationUrl ? `<p style="margin-top:24px"><a href="${verificationUrl}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Verify email ownership</a></p>` : ""}<p style="margin-top:24px">Scan the official site QR code, complete GPS verification when enabled, then enter your Visitor ID and access code to check in or check out.</p><p style="color:#9a3412"><b>Security reminder:</b> Never share your credentials.</p><p>SITEPASS Team</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, htmlContent, textContent };
}
