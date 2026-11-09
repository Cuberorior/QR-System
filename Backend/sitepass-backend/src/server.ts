
import "dotenv/config";
import app from "./app";
import { prisma } from "./config/prisma";
import { expireOpenAttendance, startAttendanceAutoExit } from "./services/attendance-auto-exit";
import { readHttpConfig, validateProductionEnvironment } from "./config/runtime";

const { port, host } = readHttpConfig();

async function startServer() {
  try {
    validateProductionEnvironment();
    await prisma.$connect();
    console.log("MySQL connected successfully");
    await expireOpenAttendance();
    const stopAttendanceAutoExit = startAttendanceAutoExit();

    const server = app.listen(port, host, () => {
      console.log(
        `SITEPASS API listening on ${host}:${port}`
      );
    });
    let closing = false;
    const shutdown = () => {
      if (closing) return;
      closing = true;
      stopAttendanceAutoExit();
      const deadline = setTimeout(() => process.exit(1), 15000);
      deadline.unref();
      server.close(() => {
        void prisma.$disconnect().then(() => {
          clearTimeout(deadline);
          process.exit(0);
        }).catch(() => process.exit(1));
      });
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    server.on("error", (error) => {
      stopAttendanceAutoExit();
      console.error("HTTP server failed:", error.message);
      void prisma.$disconnect().finally(() => process.exit(1));
    });
  } catch (error) {
    console.error("Backend startup failed:", error);
    process.exit(1);
  }
}

startServer();
