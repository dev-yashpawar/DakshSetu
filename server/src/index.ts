import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import express from "express";
import { existsSync } from "node:fs";
import { connectDatabase } from "./models.js";
import { seedDatabase } from "./services.js";
import { createApp } from "./app.js";
import { CloudinaryStorage } from "./evidence.js";
import { validateProductionConfig } from "./production-config.js";
dotenv.config({ path: resolve(process.cwd(), ".env") });
const production = process.env.NODE_ENV === "production";
validateProductionConfig(process.env);
const { connection, models } = await connectDatabase(
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27027/dakshsetu",
);
if (!production || process.env.SEED_DEMO === "true") await seedDatabase(models);
const app = createApp(models, {
  jwtSecret: process.env.JWT_SECRET || randomBytes(48).toString("hex"),
  clientUrls: (
    process.env.CLIENT_URL || "http://127.0.0.1:5173,http://localhost:5173"
  )
    .split(",")
    .map((s) => s.trim()),
  ai: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  },
  imageStorage: new CloudinaryStorage({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  }),
  trustProxy: process.env.TRUST_PROXY === "1" ? 1 : 0,
  allowDemoLogin: !production || process.env.ALLOW_DEMO_LOGIN === "true",
  publicAppUrl:
    process.env.PUBLIC_APP_URL ||
    (!production ? "http://127.0.0.1:5173" : undefined),
});
if (production) {
  const clientDist = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../client/dist",
  );
  // Backend-only deployments do not have a frontend build to serve.
  if (existsSync(resolve(clientDist, "index.html"))) {
    app.use(
      express.static(clientDist, {
        setHeaders(res, path) {
          if (path.endsWith("sw.js") || path.endsWith("index.html"))
            res.setHeader("Cache-Control", "no-cache");
          else if (path.includes("assets"))
            res.setHeader(
              "Cache-Control",
              "public, max-age=31536000, immutable",
            );
        },
      }),
    );
    app.get("*", (_req, res) =>
      res.sendFile(resolve(clientDist, "index.html")),
    );
  }
}
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || (production ? "0.0.0.0" : "127.0.0.1");
const server = app.listen(port, host, () =>
  console.log(
    `DakshSetu API ready at http://${host}:${port} · MongoDB connected · Phases 1–14`,
  ),
);
const stop = () => {
  server.close(() => {
    void connection.close().then(() => process.exit(0));
  });
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
