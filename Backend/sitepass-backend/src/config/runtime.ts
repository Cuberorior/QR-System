import { readFileSync } from "node:fs";

type Environment = Record<string, string | undefined>;

export function readDatabaseTls(env: Environment = process.env) {
  if (env.DATABASE_SSL && !["true", "false"].includes(env.DATABASE_SSL)) {
    throw new Error("DATABASE_SSL must be true or false.");
  }
  const caPath = env.DATABASE_SSL_CA_PATH?.trim();
  if (env.DATABASE_SSL !== "true" && !caPath) return undefined;
  return { rejectUnauthorized: true, ...(caPath ? { ca: readFileSync(caPath, "utf8") } : {}) };
}

export function readHttpConfig(env: Environment = process.env) {
  const port = Number(env.PORT || 5001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535.");
  const production = env.NODE_ENV === "production";
  const frontendUrl = env.FRONTEND_URL?.trim().replace(/\/+$/, "");
  if (production) {
    let url: URL;
    try { url = new URL(frontendUrl || ""); }
    catch { throw new Error("FRONTEND_URL must be the public HTTPS frontend origin."); }
    if (url.protocol !== "https:" || url.origin !== frontendUrl) {
      throw new Error("FRONTEND_URL must be the public HTTPS frontend origin without a path.");
    }
  }
  const proxy = env.TRUST_PROXY?.trim();
  if (proxy === "true" || (proxy && /^\d+$/.test(proxy) && proxy !== "0")) {
    throw new Error("TRUST_PROXY must name trusted proxy IPs/subnets (for example loopback), not all proxies or a hop count.");
  }
  return {
    port,
    host: env.HOST || "0.0.0.0",
    trustProxy: !proxy || proxy === "false" || proxy === "0" ? false as const : proxy,
    origins: production ? [frontendUrl!] : ["http://localhost:5173", "http://127.0.0.1:5173", frontendUrl].filter((value): value is string => Boolean(value)),
  };
}

export function validateProductionEnvironment(env: Environment = process.env) {
  if (env.NODE_ENV !== "production") return;
  for (const key of ["DATABASE_URL", "DATABASE_HOST", "DATABASE_PORT", "DATABASE_USER", "DATABASE_PASSWORD", "DATABASE_NAME"]) {
    if (!env[key]?.trim() || env[key]?.includes("REPLACE_WITH_")) throw new Error(`${key} must be configured for production.`);
  }
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || /replace|change-me/i.test(env.JWT_SECRET)) {
    throw new Error("JWT_SECRET must be a random production secret of at least 32 characters.");
  }
  let databaseUrl: URL;
  try { databaseUrl = new URL(env.DATABASE_URL!); }
  catch { throw new Error("DATABASE_URL must be a valid MySQL connection URL."); }
  if (databaseUrl.protocol !== "mysql:") throw new Error("DATABASE_URL must use mysql://.");
  const port = Number(env.DATABASE_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("DATABASE_PORT must be between 1 and 65535.");
  if (databaseUrl.hostname !== env.DATABASE_HOST || Number(databaseUrl.port || 3306) !== port ||
      decodeURIComponent(databaseUrl.username) !== env.DATABASE_USER ||
      decodeURIComponent(databaseUrl.password) !== env.DATABASE_PASSWORD ||
      decodeURIComponent(databaseUrl.pathname.slice(1)) !== env.DATABASE_NAME) {
    throw new Error("DATABASE_URL and DATABASE_* settings must identify the same database and credentials.");
  }
}
