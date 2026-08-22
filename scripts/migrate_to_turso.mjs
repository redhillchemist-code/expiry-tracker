// One-off migration: copies data from local SQLite files (data-<dept>.db) into
// their corresponding Turso-hosted databases, using the same env vars the app
// uses at runtime (TURSO_DATABASE_URL_<DEPT> / TURSO_AUTH_TOKEN_<DEPT>).
import { createClient as createLocalClient } from "@libsql/client";
import { createClient as createRemoteClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DEPARTMENTS = [
  { id: "front-shop", envKey: "FRONT_SHOP", file: "data-front-shop.db" },
  { id: "dispensary", envKey: "DISPENSARY", file: "data-dispensary.db" },
];

async function migrateDept(dept) {
  const dbUrl = process.env[`TURSO_DATABASE_URL_${dept.envKey}`];
  const authToken = process.env[`TURSO_AUTH_TOKEN_${dept.envKey}`];
  if (!dbUrl || !authToken) {
    throw new Error(`Missing Turso env vars for ${dept.id}`);
  }

  const localPath = path.resolve(process.cwd(), dept.file);
  if (!fs.existsSync(localPath)) {
    console.log(`[${dept.id}] no local db file at ${localPath}, skipping`);
    return;
  }

  console.log(`\n=== Migrating ${dept.id} ===`);
  const local = createLocalClient({ url: `file:${localPath}` });
  const remote = createRemoteClient({ url: dbUrl, authToken });

  // Ensure schema exists on remote (matches server/storage.ts bootstrap).
  await remote.batch(
    [
      `CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barcode TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        expiry_date TEXT NOT NULL,
        scanned_at TEXT NOT NULL,
        notes TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        warning_days INTEGER NOT NULL DEFAULT 90,
        critical_days INTEGER NOT NULL DEFAULT 30,
        report_email_1 TEXT,
        report_email_2 TEXT,
        report_send_day INTEGER NOT NULL DEFAULT 1
      )`,
    ],
    "write"
  );

  // Wipe any existing rows on remote first, in case this is re-run.
  await remote.batch(
    ["DELETE FROM batches", "DELETE FROM products", "DELETE FROM settings"],
    "write"
  );

  const products = (await local.execute("SELECT * FROM products")).rows;
  const batches = (await local.execute("SELECT * FROM batches")).rows;
  const settingsRows = (await local.execute("SELECT * FROM settings")).rows;

  console.log(`[${dept.id}] local rows: ${products.length} products, ${batches.length} batches, ${settingsRows.length} settings`);

  const statements = [];

  for (const p of products) {
    statements.push({
      sql: "INSERT INTO products (id, barcode, name) VALUES (?, ?, ?)",
      args: [p.id, p.barcode, p.name],
    });
  }
  for (const b of batches) {
    statements.push({
      sql: "INSERT INTO batches (id, product_id, quantity, expiry_date, scanned_at, notes) VALUES (?, ?, ?, ?, ?, ?)",
      args: [b.id, b.product_id, b.quantity, b.expiry_date, b.scanned_at, b.notes ?? null],
    });
  }
  for (const s of settingsRows) {
    statements.push({
      sql: "INSERT INTO settings (id, warning_days, critical_days, report_email_1, report_email_2, report_send_day) VALUES (?, ?, ?, ?, ?, ?)",
      args: [s.id, s.warning_days, s.critical_days, s.report_email_1 ?? null, s.report_email_2 ?? null, s.report_send_day],
    });
  }

  if (statements.length > 0) {
    // Batch in chunks to stay well under request size limits.
    const CHUNK = 500;
    for (let i = 0; i < statements.length; i += CHUNK) {
      await remote.batch(statements.slice(i, i + CHUNK), "write");
      console.log(`[${dept.id}] wrote rows ${i + 1}-${Math.min(i + CHUNK, statements.length)} of ${statements.length}`);
    }
  }

  // Verify counts on remote.
  const remoteProducts = (await remote.execute("SELECT COUNT(*) as c FROM products")).rows[0].c;
  const remoteBatches = (await remote.execute("SELECT COUNT(*) as c FROM batches")).rows[0].c;
  const remoteSettings = (await remote.execute("SELECT COUNT(*) as c FROM settings")).rows[0].c;
  console.log(`[${dept.id}] remote after migration: ${remoteProducts} products, ${remoteBatches} batches, ${remoteSettings} settings`);

  local.close();
  remote.close();
}

async function main() {
  for (const dept of DEPARTMENTS) {
    await migrateDept(dept);
  }
  console.log("\nMigration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
