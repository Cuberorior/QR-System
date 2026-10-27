
import "dotenv/config";
import mariadb from "mariadb";

async function testConnection() {
  let connection;

  try {
    connection = await mariadb.createConnection({
      host: process.env.DATABASE_HOST || "127.0.0.1",
      port: Number(process.env.DATABASE_PORT || 3306),
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME || "sitepass_db",
      connectTimeout: 10000,
    });

    console.log("MySQL connection successful!");

    const rows = await connection.query(
      "SELECT siteCode, name FROM ConstructionSite"
    );

    console.log("Construction sites:", rows);

  } catch (error) {
    console.error("MySQL connection failed:", error);
    process.exitCode = 1;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

testConnection();
