import type { Express } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { getStorage, type DatabaseStorage } from "./storage";
import { insertProductSchema, insertBatchSchema, insertSettingsSchema, importProductsSchema } from "@shared/schema";
import {
  DEPARTMENT_IDS,
  DEPARTMENT_LABELS,
  DEFAULT_DEPARTMENT,
  isDepartment,
} from "@shared/departments";
import { z } from "zod";

declare global {
  namespace Express {
    interface Request {
      storage: DatabaseStorage;
    }
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ---------- Departments ----------

  app.get("/api/departments", (_req, res) => {
    res.json(DEPARTMENT_IDS.map((id) => ({ id, label: DEPARTMENT_LABELS[id] })));
  });

  // Resolve which department's isolated database this request should use, based on the
  // X-Department header the client sends. Falls back to the default if missing/invalid.
  app.use("/api", (req, _res, next) => {
    const header = req.header("x-department");
    const department = isDepartment(header) ? header : DEFAULT_DEPARTMENT;
    getStorage(department)
      .then((storage) => {
        req.storage = storage;
        next();
      })
      .catch(next);
  });

  // ---------- Products ----------

  app.get("/api/products", async (req, res) => {
    const list = await req.storage.listProducts();
    res.json(list);
  });

  app.get("/api/products/lookup/:barcode", async (req, res) => {
    const product = await req.storage.getProductByBarcode(req.params.barcode);
    if (!product) {
      return res.status(404).json({ message: "No product found for this barcode" });
    }
    res.json(product);
  });

  app.post("/api/products", async (req, res) => {
    try {
      const { storage } = req;
      const data = insertProductSchema.parse(req.body);
      const existing = await storage.getProductByBarcode(data.barcode);
      if (existing) {
        return res.status(409).json({ message: "A product with this barcode already exists" });
      }
      const product = await storage.createProduct(data);
      res.status(201).json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.issues[0]?.message ?? "Invalid product data" });
      }
      res.status(400).json({ message: "Invalid product data" });
    }
  });

  app.patch("/api/products/:id", async (req, res) => {
    const id = Number(req.params.id);
    const nameSchema = z.object({ name: z.string().min(1) });
    try {
      const { name } = nameSchema.parse(req.body);
      const updated = await req.storage.updateProduct(id, name);
      if (!updated) return res.status(404).json({ message: "Product not found" });
      res.json(updated);
    } catch {
      res.status(400).json({ message: "Invalid product data" });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    await req.storage.deleteProduct(Number(req.params.id));
    res.status(204).end();
  });

  app.post("/api/products/import", async (req, res) => {
    try {
      const { items } = importProductsSchema.parse(req.body);
      const result = await req.storage.importProducts(items);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.issues[0]?.message ?? "Invalid CSV data" });
      }
      res.status(400).json({ message: "Invalid CSV data" });
    }
  });

  // Wipes the entire product master list for the active department (and, as a
  // consequence, all batches too since they reference products). Used by the "Clear
  // product list" danger-zone action so staff can start a department fresh.
  app.delete("/api/products", async (req, res) => {
    await req.storage.clearProducts();
    res.status(204).end();
  });

  // ---------- Batches ----------

  app.get("/api/batches", async (req, res) => {
    const list = await req.storage.listBatches();
    res.json(list);
  });

  app.post("/api/batches", async (req, res) => {
    try {
      const data = insertBatchSchema.parse(req.body);
      const batch = await req.storage.createBatch(data);
      res.status(201).json(batch);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.issues[0]?.message ?? "Invalid batch data" });
      }
      res.status(400).json({ message: "Invalid batch data" });
    }
  });

  app.patch("/api/batches/:id", async (req, res) => {
    const id = Number(req.params.id);
    const updateSchema = z.object({
      quantity: z.number().int().positive().optional(),
      expiryDate: z.string().min(1).optional(),
      notes: z.string().nullable().optional(),
    });
    try {
      const data = updateSchema.parse(req.body);
      const updated = await req.storage.updateBatch(id, data);
      if (!updated) return res.status(404).json({ message: "Batch not found" });
      res.json(updated);
    } catch {
      res.status(400).json({ message: "Invalid batch data" });
    }
  });

  app.delete("/api/batches/:id", async (req, res) => {
    await req.storage.deleteBatch(Number(req.params.id));
    res.status(204).end();
  });

  // Wipes all scanned inventory (batches) for the active department, but keeps the
  // product master list intact. Used by the "Clear inventory" danger-zone action.
  app.delete("/api/batches", async (req, res) => {
    await req.storage.clearBatches();
    res.status(204).end();
  });

  // ---------- Settings ----------

  app.get("/api/settings", async (req, res) => {
    res.json(await req.storage.getSettings());
  });

  app.patch("/api/settings", async (req, res) => {
    try {
      const data = insertSettingsSchema.partial().parse(req.body);
      const updated = await req.storage.updateSettings(data as any);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.issues[0]?.message ?? "Invalid settings data" });
      }
      res.status(400).json({ message: "Invalid settings data" });
    }
  });

  // ---------- CSV Export ----------

  app.get("/api/export", async (req, res) => {
    const rows = await req.storage.listBatches();
    const header = ["Barcode", "Product Name", "Quantity", "Expiry Date", "Days Until Expiry", "Status", "Scanned At"];
    const escape = (val: string | number) => {
      const s = String(val);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          escape(r.barcode),
          escape(r.productName),
          escape(r.quantity),
          escape(r.expiryDate),
          escape(r.daysUntilExpiry),
          escape(r.status),
          escape(r.scannedAt),
        ].join(",")
      );
    }
    const csv = lines.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=expiry-tracker-export.csv");
    res.status(200).send(csv);
  });

  return httpServer;
}
