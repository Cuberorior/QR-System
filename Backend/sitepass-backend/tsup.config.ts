import { defineConfig } from "tsup";

export default defineConfig({
  entry: { server: "src/server.ts", "create-initial-admin": "scripts/create-initial-admin.ts" },
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  bundle: true,
  splitting: false,
  clean: true,
  sourcemap: true,
  external: ["@prisma/client", "bcrypt", "mariadb", "mysql2"]
});
