import "dotenv/config";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../src/config/prisma";
import { validateProductionEnvironment } from "../src/config/runtime";

const credentials = z.object({
  email: z.string().trim().email().max(191).transform(value => value.toLowerCase()),
  fullName: z.string().trim().min(1).max(191),
  // bcrypt only uses the first 72 bytes.
  password: z.string().min(12).refine(value => Buffer.byteLength(value, "utf8") <= 72),
});

async function main() {
  const parsed = credentials.safeParse({
    email: process.env.SITEPASS_ADMIN_EMAIL,
    fullName: process.env.SITEPASS_ADMIN_NAME,
    password: process.env.SITEPASS_ADMIN_PASSWORD,
  });
  if (!parsed.success) throw new Error("Set SITEPASS_ADMIN_EMAIL, SITEPASS_ADMIN_NAME, and SITEPASS_ADMIN_PASSWORD (12+ characters, at most 72 UTF-8 bytes). Credentials were not printed.");
  validateProductionEnvironment();
  const { password, ...identity } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async tx => {
    if (await tx.administrator.count()) throw new Error("An administrator already exists. No account was created or changed.");
    await tx.administrator.create({ data: { ...identity, passwordHash, role: "ADMIN", isActive: true } });
  }, { isolationLevel: "Serializable" });
  console.log("Initial administrator created. Remove the temporary SITEPASS_ADMIN_* credentials from the environment.");
}

main().catch((error) => {
  // Do not print Prisma query arguments or credentials on a database failure.
  const message = error instanceof Error ? error.message : "";
  console.error(message.startsWith("Set SITEPASS_ADMIN_") || message.startsWith("An administrator already exists.")
    ? message : "Administrator creation failed. Check the database connection, migrations, and production environment.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
