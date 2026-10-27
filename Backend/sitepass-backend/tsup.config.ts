import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["api/index.ts"],
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