
import "dotenv/config";
import app from "./app";
import { prisma } from "./config/prisma";

const PORT = Number(process.env.PORT || 5001);

async function startServer() {
  try {
    await prisma.$connect();
    console.log("MySQL connected successfully");

    app.listen(PORT, () => {
      console.log(
        `SITEPASS API running at http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error("Backend startup failed:", error);
    process.exit(1);
  }
}

startServer();
