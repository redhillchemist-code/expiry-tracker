// Entry point used only for the Vercel serverless deployment. Unlike server/index.ts
// (which calls httpServer.listen() for the traditional long-running server), this file
// exports the Express app as a request handler, per Vercel's Node.js runtime contract.
// Routes are registered lazily on first invocation and reused across warm invocations.
import "dotenv/config";
import express, { Response, NextFunction } from "express";
import type { Request } from "express";
import { createServer } from "node:http";
import { registerRoutes } from "./routes";

const app = express();

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

let readyPromise: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const httpServer = createServer(app);
      await registerRoutes(httpServer, app);

      app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        console.error("Internal Server Error:", err);
        if (res.headersSent) {
          return next(err);
        }
        res.status(status).json({ message });
      });
    })();
  }
  return readyPromise;
}

export default async function handler(req: any, res: any) {
  await ensureReady();
  return (app as any)(req, res);
}
