import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPostgresDatabase } from "./postgres-client.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(currentDir, "postgres", "migrations");

export const migratePostgres = async () => {
  const db = getPostgresDatabase();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const alreadyApplied = await db.one<{ version: string }>(
      `SELECT version FROM schema_migrations WHERE version = $1`,
      [version]
    );

    if (alreadyApplied) {
      continue;
    }

    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    await db.transaction(async (tx) => {
      await tx.execute(sql);
      await tx.execute(`INSERT INTO schema_migrations (version) VALUES ($1)`, [version]);
    });
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  migratePostgres()
    .then(() => {
      console.log("PostgreSQL migrations applied");
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
