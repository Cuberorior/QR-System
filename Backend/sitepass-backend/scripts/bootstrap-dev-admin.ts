import "dotenv/config";
import bcrypt from "bcrypt";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { prisma } from "../src/config/prisma";

function hiddenPrompt(question: string): Promise<string> {
  if (!input.isTTY || !output.isTTY) return Promise.reject(new Error("Set SITEPASS_ADMIN_PASSWORD in the environment for non-interactive bootstrap."));
  return new Promise((resolve) => {
    output.write(question);
    const onData = (chunk: Buffer) => {
      const value = chunk.toString();
      if (value.includes("\n") || value.includes("\r")) {
        input.setRawMode?.(false);
        input.pause();
        input.off("data", onData);
        output.write("\n");
        resolve(value.replace(/[\r\n]/g, ""));
      }
    };
    input.setRawMode?.(true);
    input.resume();
    input.on("data", onData);
  });
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Development bootstrap is disabled in production.");

  const existingCount = await prisma.administrator.count();
  if (existingCount > 0 && process.env.SITEPASS_ADMIN_RESET_EXISTING !== "true") {
    console.log("Administrator bootstrap skipped: an administrator already exists.");
    return;
  }

  let email = (process.env.SITEPASS_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!email) {
    const readline = createInterface({ input, output });
    email = (await readline.question("Administrator email: ")).trim().toLowerCase();
    readline.close();
  }
  const fullName = (process.env.SITEPASS_ADMIN_NAME || "SITEPASS Development Administrator").trim();
  const password = process.env.SITEPASS_ADMIN_PASSWORD || await hiddenPrompt("Administrator password: ");
  if (!email || !password || password.length < 12) throw new Error("Administrator email and a password of at least 12 characters are required.");

  const passwordHash = await bcrypt.hash(password, 12);
  if (existingCount > 0) {
    const existing = await prisma.administrator.findUnique({ where: { email } });
    if (!existing) throw new Error("SITEPASS_ADMIN_EMAIL does not match an existing administrator.");
    await prisma.administrator.update({ where: { id: existing.id }, data: { passwordHash, isActive: true } });
    console.log("Development administrator password reset successfully. Credentials were not printed.");
  } else {
    await prisma.administrator.create({ data: { fullName, email, passwordHash, role: "ADMIN", isActive: true } });
    console.log("Development ADMIN created successfully. Credentials were not printed.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Administrator bootstrap failed.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
