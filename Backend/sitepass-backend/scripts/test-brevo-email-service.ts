import assert from "node:assert/strict";
import { sendBrevoEmail, welcomeEmail } from "../src/services/brevo-email";

process.env.BREVO_API_KEY = "test-key";
process.env.BREVO_SENDER_EMAIL = "sender@example.com";
process.env.BREVO_SENDER_NAME = "SITEPASS";
const originalFetch = globalThis.fetch;
try {
  let calls = 0;
  const template = welcomeEmail({ fullName: "<Employee>", employeeCode: "EMP-000001", accessCode: "secure-code", siteName: "Main & Site" });
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    assert.equal((init?.headers as Record<string, string>)["api-key"], "test-key");
    const payload = JSON.parse(String(init?.body)) as { sender: { email: string }; htmlContent: string; textContent: string };
    assert.equal(payload.sender.email, "sender@example.com");
    assert.match(payload.htmlContent, /Secure Construction Site Access/);
    assert.match(payload.htmlContent, /Welcome to SITEPASS!/);
    assert.match(payload.htmlContent, /&lt;Employee&gt;/);
    assert.doesNotMatch(payload.htmlContent, /<Employee>/);
    assert.match(payload.htmlContent, /Main &amp; Site/);
    assert.match(payload.htmlContent, /secure-code/);
    assert.match(payload.textContent, /Complete GPS verification if required/);
    assert.match(payload.textContent, /Never share your access code/);
    return new Response(JSON.stringify({ messageId: "test-message-id" }), { status: 201 });
  };
  const sent = await sendBrevoEmail({ to: "employee@example.com", ...template });
  assert.equal(sent.accepted, true); assert.equal(sent.messageId, "test-message-id"); assert.equal(calls, 1);
  assert.match(template.textContent, /Employee ID: EMP-000001/);
  assert.match(template.textContent, /Assigned Construction Site: Main & Site/);
  assert.match(template.textContent, /SITEPASS Team/);
  globalThis.fetch = async () => new Response("unauthorized", { status: 401 });
  const rejected = await sendBrevoEmail({ to: "employee@example.com", subject: "Test", textContent: "Test", htmlContent: "<p>Test</p>" });
  assert.equal(rejected.accepted, false); assert.equal(rejected.status, "FAILED");
  console.log("Brevo email service tests passed.");
} finally { globalThis.fetch = originalFetch; }
