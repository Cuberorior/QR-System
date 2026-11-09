import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
    // Only development migrations need a shadow database.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
});
