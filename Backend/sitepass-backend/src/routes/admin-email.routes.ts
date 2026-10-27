import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAdmin } from "../middleware/admin-auth";
import { sendBrevoEmail } from "../services/brevo-email";

const router = Router();
router.use(requireAdmin);
const testLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 3, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, message: "Too many Brevo test-email requests." } });

router.post("/test", testLimit, async (req, res) => {
  const parsed = z.object({ recipient: z.string().trim().email().max(191) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "A valid explicit recipient email is required." });
  try {
    const result = await sendBrevoEmail({ to: parsed.data.recipient, subject: "SITEPASS Brevo connection test", textContent: "This is a SITEPASS Brevo connection test.", htmlContent: "<p>This is a <strong>SITEPASS</strong> Brevo connection test.</p>" });
    return res.status(result.accepted ? 202 : 502).json({ success: result.accepted, status: result.status, messageId: result.messageId, message: result.accepted ? "Brevo accepted the test email; delivery is not yet confirmed." : result.error });
  } catch (error) { return res.status(503).json({ success: false, status: "FAILED", message: error instanceof Error ? error.message : "Brevo email configuration is unavailable." }); }
});

export default router;
