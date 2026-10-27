import "dotenv/config";
import { sendBrevoEmail } from "../src/services/brevo-email";

const recipient = process.argv[2] || process.env.BREVO_TEST_RECIPIENT;
if (!recipient) throw new Error("Provide an explicit test recipient: npm run email:test -- recipient@example.com");
if (!/^\S+@\S+\.\S+$/.test(recipient)) throw new Error("The test recipient must be a valid email address.");

const result = await sendBrevoEmail({ to: recipient, subject: "SITEPASS Brevo connection test", textContent: "This is a SITEPASS Brevo connection test.", htmlContent: "<p>This is a <strong>SITEPASS</strong> Brevo connection test.</p>" });
console.log(JSON.stringify({ ...result, recipient }, null, 2));
if (!result.accepted) process.exitCode = 1;
