import assert from "node:assert/strict";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { readHttpConfig, readDatabaseTls, validateProductionEnvironment } from "../src/config/runtime";

const production = {
  NODE_ENV: "production", FRONTEND_URL: "https://qrsystem.com", TRUST_PROXY: "loopback",
  DATABASE_URL: "mysql://test:p%40ss@127.0.0.1:3306/sitepass_test",
  DATABASE_HOST: "127.0.0.1", DATABASE_PORT: "3306", DATABASE_USER: "test",
  DATABASE_PASSWORD: "p@ss", DATABASE_NAME: "sitepass_test", JWT_SECRET: "test-only-secret-".repeat(4),
};
validateProductionEnvironment(production);
assert.equal(readHttpConfig(production).trustProxy, "loopback");
assert.deepEqual(readHttpConfig(production).origins, ["https://qrsystem.com"]);
assert.equal(readHttpConfig({}).trustProxy, false);
assert.throws(() => readHttpConfig({ ...production, FRONTEND_URL: "http://localhost:5173" }), /HTTPS/);
assert.throws(() => readHttpConfig({ ...production, FRONTEND_URL: "https://qrsystem.com/admin" }), /without a path/);
assert.throws(() => readHttpConfig({ PORT: "invalid" }), /PORT/);
assert.throws(() => readHttpConfig({ TRUST_PROXY: "true" }), /TRUST_PROXY/);
assert.throws(() => validateProductionEnvironment({ ...production, JWT_SECRET: "short" }), /JWT_SECRET/);
assert.throws(() => validateProductionEnvironment({ ...production, DATABASE_NAME: "wrong_db" }), /same database/);
assert.throws(() => validateProductionEnvironment({ ...production, DATABASE_PASSWORD: "wrong" }), /same database/);
assert.equal(readDatabaseTls({}), undefined);
assert.deepEqual(readDatabaseTls({ DATABASE_SSL: "true" }), { rejectUnauthorized: true });
assert.throws(() => readDatabaseTls({ DATABASE_SSL: "invalid" }), /DATABASE_SSL/);
assert.throws(() => readDatabaseTls({ DATABASE_SSL_CA_PATH: "missing-sitepass-test-certificate.crt" }));

// Exercise the actual production bundles without opening a database connection.
const bundleEnv = { ...process.env, ...production, DOTENV_CONFIG_PATH: "missing-deployment-test.env", DATABASE_SSL: "false", DATABASE_SSL_CA_PATH: "" };
const invalidStartup = spawnSync(process.execPath, ["dist/server.js"], {
  env: { ...bundleEnv, JWT_SECRET: "short" }, encoding: "utf8", timeout: 15000,
});
assert.equal(invalidStartup.status, 1);
assert.match(invalidStartup.stderr, /JWT_SECRET must be a random production secret/);
const invalidAdmin = spawnSync(process.execPath, ["dist/create-initial-admin.js"], {
  env: { ...bundleEnv, SITEPASS_ADMIN_EMAIL: "", SITEPASS_ADMIN_NAME: "", SITEPASS_ADMIN_PASSWORD: "" },
  encoding: "utf8", timeout: 15000,
});
assert.equal(invalidAdmin.status, 1);
assert.match(invalidAdmin.stderr, /Set SITEPASS_ADMIN_EMAIL/);

// No database queries: invalid login bodies fail validation before querying Prisma.
Object.assign(process.env, production, { DATABASE_SSL: "false", DOTENV_CONFIG_PATH: "missing-deployment-test.env" });
delete process.env.DATABASE_SSL_CA_PATH;
const { default: app } = await import("../src/app");
const { prisma } = await import("../src/config/prisma");
const server = app.listen(0, "127.0.0.1");
try {
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${base}/api/health`, { headers: { Origin: "https://qrsystem.com" } });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("access-control-allow-origin"), "https://qrsystem.com");
  const localOrigin = await fetch(`${base}/api/health`, { headers: { Origin: "http://localhost:5173" } });
  assert.equal(localOrigin.headers.get("access-control-allow-origin"), null);
  const login = (ip: string) => fetch(`${base}/api/admin/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip }, body: "{}",
  });
  for (let index = 0; index < 10; index++) assert.equal((await login("198.51.100.10")).status, 400);
  assert.equal((await login("198.51.100.10")).status, 429);
  assert.equal((await login("198.51.100.11")).status, 400, "A second client must not share the proxy's rate limit");
  console.log("Deployment checks passed: environment validation, HTTPS origins, TLS options, health, and per-client proxy rate limits.");
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await prisma.$disconnect();
}
