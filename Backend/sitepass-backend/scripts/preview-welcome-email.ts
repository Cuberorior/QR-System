import "dotenv/config";
import { sendBrevoEmail, welcomeEmail } from "../src/services/brevo-email";

const recipient = process.argv[2] || process.env.BREVO_TEST_RECIPIENT;
if (!recipient) {
  console.error("Usage: npm run email:preview -- developer@example.com");
  process.exitCode = 1;
} else {
  const template = welcomeEmail({
    fullName: "SITEPASS Preview Employee",
    employeeCode: "EMP-000999",
    accessCode: "TEMP-DEMO-4821",
    siteName: "SITEPASS Demo Construction Site",
  });
  const result = await sendBrevoEmail({ to: recipient, ...template });
  console.log(JSON.stringify({ recipient, accepted: result.accepted, status: result.status, messageId: result.messageId, error: result.error }));
  if (!result.accepted) process.exitCode = 1;
}
