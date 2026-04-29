/**
 * Applies Prisma migration SQL files to a Turso/LibSQL database.
 * Use this instead of `prisma migrate deploy` for production Turso databases.
 *
 * Usage:
 *   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... npx tsx scripts/migrate-turso.ts
 *
 * Or via npm:
 *   npm run db:migrate
 */

import { createClient } from "@libsql/client";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!url) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const client = createClient({ url, authToken });

async function ensureMigrationsTable() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS _turso_migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await client.execute("SELECT name FROM _turso_migrations");
  return new Set(result.rows.map((r) => r.name as string));
}

async function applyMigration(name: string, sql: string) {
  // Strip comment lines, then split on semicolons
  const stripped = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const statements = stripped
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await client.execute(statement + ";");
  }

  await client.execute({
    sql: "INSERT INTO _turso_migrations (name) VALUES (?)",
    args: [name],
  });
}

async function main() {
  const reset = process.argv.includes("--reset");
  const migrationsDir = join(process.cwd(), "prisma", "migrations");

  await ensureMigrationsTable();

  if (reset) {
    console.log("⚠️  --reset: dropping all tables and re-running all migrations");
    const tables = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    );
    for (const row of tables.rows) {
      await client.execute(`DROP TABLE IF EXISTS "${row.name}"`);
    }
    // Recreate the tracking table after the wipe
    await ensureMigrationsTable();
  }

  const applied = await getAppliedMigrations();

  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const migrationDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  let count = 0;
  for (const dir of migrationDirs) {
    if (applied.has(dir)) {
      console.log(`  ⏭  ${dir} (already applied)`);
      continue;
    }
    const sqlPath = join(migrationsDir, dir, "migration.sql");
    let sql: string;
    try {
      sql = await readFile(sqlPath, "utf-8");
    } catch {
      console.warn(`  ⚠️  ${dir} — no migration.sql, skipping`);
      continue;
    }

    process.stdout.write(`  ⏳ Applying ${dir}… `);
    await applyMigration(dir, sql);
    console.log("done");
    count++;
  }

  if (count === 0) {
    console.log("✅ Database is up to date — no migrations to apply");
  } else {
    console.log(`\n✅ Applied ${count} migration(s)`);
  }

  await client.close();
}

main().catch((err) => {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
});
