import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Product master list — typically imported from a CSV of barcode + product name.
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  barcode: text("barcode").notNull().unique(),
  name: text("name").notNull(),
});

// A tracked batch/unit of a product that has been scanned in, with its own expiry date.
// A single product can have multiple open batches at once (common in pharmacy stock).
export const batches = sqliteTable("batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  expiryDate: text("expiry_date").notNull(), // ISO date, YYYY-MM-DD
  scannedAt: text("scanned_at").notNull(), // ISO timestamp
  notes: text("notes"),
});

// Single-row settings table for expiry alert thresholds (in days), plus this department's
// monthly report email delivery config (up to 2 recipient addresses, and which day of the
// month the report is sent).
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  warningDays: integer("warning_days").notNull().default(90),
  criticalDays: integer("critical_days").notNull().default(30),
  reportEmail1: text("report_email_1"),
  reportEmail2: text("report_email_2"),
  reportSendDay: integer("report_send_day").notNull().default(1),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const insertBatchSchema = createInsertSchema(batches).omit({ id: true, scannedAt: true });
export type InsertBatch = z.infer<typeof insertBatchSchema>;
export type Batch = typeof batches.$inferSelect;

const emailOrEmpty = z
  .string()
  .trim()
  .refine((v) => v === "" || z.string().email().safeParse(v).success, {
    message: "Enter a valid email address",
  })
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const insertSettingsSchema = createInsertSchema(settings, {
  reportEmail1: () => emailOrEmpty,
  reportEmail2: () => emailOrEmpty,
  reportSendDay: () => z.coerce.number().int().min(1).max(28),
}).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

// CSV import payload: array of raw rows to upsert into the product master list.
export const importProductsSchema = z.object({
  items: z.array(
    z.object({
      barcode: z.string().min(1),
      name: z.string().min(1),
    })
  ),
});
export type ImportProducts = z.infer<typeof importProductsSchema>;

// Enriched batch shape returned by the API — joins in product info and computed expiry status.
export type ExpiryStatus = "expired" | "critical" | "warning" | "fresh";

export type BatchWithProduct = Batch & {
  barcode: string;
  productName: string;
  daysUntilExpiry: number;
  status: ExpiryStatus;
};
