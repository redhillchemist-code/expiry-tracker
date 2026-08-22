import { products, batches, settings } from "@shared/schema";
import type {
  Product,
  InsertProduct,
  Batch,
  InsertBatch,
  Settings,
  InsertSettings,
  BatchWithProduct,
  ExpiryStatus,
} from "@shared/schema";
import type { Department } from "@shared/departments";
import { drizzle } from "drizzle-orm/libsql";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";

// Each department gets its own isolated database — products, batches, and settings
// are fully separate between departments (e.g. "front-shop", "dispensary").
//
// Connection resolution per department, in priority order:
//   1. A hosted Turso database, if TURSO_DATABASE_URL_<DEPT> (+ optional
//      TURSO_AUTH_TOKEN_<DEPT>) is set — this is what production (Vercel) uses.
//   2. A local SQLite file (data-<dept>.db) in the project root — used for local/sandbox
//      development so no external service is required to run the app.
function envKey(department: Department): string {
  return department.toUpperCase().replace(/-/g, "_");
}

function clientFor(department: Department): Client {
  const key = envKey(department);
  const url = process.env[`TURSO_DATABASE_URL_${key}`];
  const authToken = process.env[`TURSO_AUTH_TOKEN_${key}`];
  if (url) {
    return createClient({ url, authToken });
  }
  return createClient({ url: `file:data-${department}.db` });
}

async function bootstrap(client: Client) {
  // journal_mode is a local-file-only pragma; remote Turso databases manage this
  // themselves and reject it, so only set it when running against a local file.
  try {
    await client.execute("PRAGMA journal_mode = WAL;");
  } catch {
    // ignored — expected when connected to a remote Turso database
  }

  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barcode TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        expiry_date TEXT NOT NULL,
        scanned_at TEXT NOT NULL,
        notes TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        warning_days INTEGER NOT NULL DEFAULT 90,
        critical_days INTEGER NOT NULL DEFAULT 30,
        report_email_1 TEXT,
        report_email_2 TEXT,
        report_send_day INTEGER NOT NULL DEFAULT 1
      );`,
    ],
    "write"
  );

  // Migrate older database files (created before the monthly-report email fields existed)
  // by adding the missing columns in place. Safe to run every startup -- each ALTER is
  // skipped if the column is already present.
  const tableInfo = await client.execute("PRAGMA table_info(settings);");
  const settingsColumns = new Set(tableInfo.rows.map((r: any) => r.name as string));
  if (!settingsColumns.has("report_email_1")) {
    await client.execute("ALTER TABLE settings ADD COLUMN report_email_1 TEXT;");
  }
  if (!settingsColumns.has("report_email_2")) {
    await client.execute("ALTER TABLE settings ADD COLUMN report_email_2 TEXT;");
  }
  if (!settingsColumns.has("report_send_day")) {
    await client.execute("ALTER TABLE settings ADD COLUMN report_send_day INTEGER NOT NULL DEFAULT 1;");
  }
}

function computeStatus(daysUntilExpiry: number, warningDays: number, criticalDays: number): ExpiryStatus {
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= criticalDays) return "critical";
  if (daysUntilExpiry <= warningDays) return "warning";
  return "fresh";
}

function daysBetweenTodayAnd(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate + "T00:00:00");
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

export interface IStorage {
  // Products
  listProducts(): Promise<Product[]>;
  getProductByBarcode(barcode: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, name: string): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<void>;
  importProducts(items: { barcode: string; name: string }[]): Promise<{ created: number; updated: number }>;

  clearProducts(): Promise<void>;

  // Batches
  listBatches(): Promise<BatchWithProduct[]>;
  createBatch(batch: InsertBatch): Promise<Batch>;
  updateBatch(id: number, data: Partial<Pick<Batch, "quantity" | "expiryDate" | "notes">>): Promise<Batch | undefined>;
  deleteBatch(id: number): Promise<void>;
  clearBatches(): Promise<void>;

  // Settings
  getSettings(): Promise<Settings>;
  updateSettings(data: InsertSettings): Promise<Settings>;
}

export class DatabaseStorage implements IStorage {
  constructor(private db: LibSQLDatabase) {}

  async listProducts(): Promise<Product[]> {
    return await this.db.select().from(products).orderBy(products.name);
  }

  async getProductByBarcode(barcode: string): Promise<Product | undefined> {
    const rows = await this.db.select().from(products).where(eq(products.barcode, barcode)).limit(1);
    return rows[0];
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const rows = await this.db.insert(products).values(product).returning();
    return rows[0];
  }

  async updateProduct(id: number, name: string): Promise<Product | undefined> {
    const rows = await this.db.update(products).set({ name }).where(eq(products.id, id)).returning();
    return rows[0];
  }

  async deleteProduct(id: number): Promise<void> {
    await this.db.delete(batches).where(eq(batches.productId, id));
    await this.db.delete(products).where(eq(products.id, id));
  }

  // Wipes the entire product master list for this department. Batches reference products
  // by id, so they're cleared first to avoid leaving orphaned inventory rows behind.
  async clearProducts(): Promise<void> {
    await this.db.delete(batches);
    await this.db.delete(products);
  }

  async importProducts(items: { barcode: string; name: string }[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    for (const item of items) {
      const barcode = item.barcode.trim();
      const name = item.name.trim();
      if (!barcode || !name) continue;
      const existingRows = await this.db.select().from(products).where(eq(products.barcode, barcode)).limit(1);
      const existing = existingRows[0];
      if (existing) {
        await this.db.update(products).set({ name }).where(eq(products.id, existing.id));
        updated++;
      } else {
        await this.db.insert(products).values({ barcode, name });
        created++;
      }
    }
    return { created, updated };
  }

  async listBatches(): Promise<BatchWithProduct[]> {
    const s = await this.getSettings();
    const rows = await this.db
      .select({
        id: batches.id,
        productId: batches.productId,
        quantity: batches.quantity,
        expiryDate: batches.expiryDate,
        scannedAt: batches.scannedAt,
        notes: batches.notes,
        barcode: products.barcode,
        productName: products.name,
      })
      .from(batches)
      .innerJoin(products, eq(batches.productId, products.id))
      .orderBy(batches.expiryDate);

    return rows.map((row) => {
      const daysUntilExpiry = daysBetweenTodayAnd(row.expiryDate);
      return {
        ...row,
        daysUntilExpiry,
        status: computeStatus(daysUntilExpiry, s.warningDays, s.criticalDays),
      };
    });
  }

  async createBatch(batch: InsertBatch): Promise<Batch> {
    const rows = await this.db
      .insert(batches)
      .values({ ...batch, scannedAt: new Date().toISOString() })
      .returning();
    return rows[0];
  }

  async updateBatch(
    id: number,
    data: Partial<Pick<Batch, "quantity" | "expiryDate" | "notes">>
  ): Promise<Batch | undefined> {
    const rows = await this.db.update(batches).set(data).where(eq(batches.id, id)).returning();
    return rows[0];
  }

  async deleteBatch(id: number): Promise<void> {
    await this.db.delete(batches).where(eq(batches.id, id));
  }

  // Wipes all scanned inventory (batches) for this department, but keeps the product
  // master list intact so barcodes don't need to be re-imported afterward.
  async clearBatches(): Promise<void> {
    await this.db.delete(batches);
  }

  async getSettings(): Promise<Settings> {
    const existingRows = await this.db.select().from(settings).limit(1);
    if (existingRows[0]) return existingRows[0];
    const inserted = await this.db.insert(settings).values({ warningDays: 90, criticalDays: 30 }).returning();
    return inserted[0];
  }

  async updateSettings(data: InsertSettings): Promise<Settings> {
    const current = await this.getSettings();
    const rows = await this.db.update(settings).set(data).where(eq(settings.id, current.id)).returning();
    return rows[0];
  }
}

const instances = new Map<Department, Promise<DatabaseStorage>>();

export function getStorage(department: Department): Promise<DatabaseStorage> {
  let instance = instances.get(department);
  if (!instance) {
    instance = (async () => {
      const client = clientFor(department);
      await bootstrap(client);
      return new DatabaseStorage(drizzle(client));
    })();
    instances.set(department, instance);
  }
  return instance;
}
