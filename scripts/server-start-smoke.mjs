// Starts the actual npm start command, with no writes to the configured app database.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import mongoose from "mongoose";
const directory = resolve(process.argv[2] || "server");
assert.ok(
  existsSync(resolve(directory, "dist/server/src/index.js")),
  "Compile the selected server first",
);
assert.ok(
  existsSync(resolve(directory, "dist/shared/validation.js")),
  "Shared code must be emitted",
);
const socket = createServer();
await new Promise((r) => socket.listen(0, "127.0.0.1", r));
const port = socket.address().port;
await new Promise((r) => socket.close(r));
const database = "dakshsetu_render_start_" + randomUUID().replaceAll("-", "");
const uri = "mongodb://127.0.0.1:27027/" + database;
const frontend = "https://daksh-setu-five.vercel.app";
const env = {
  ...process.env,
  NODE_ENV: "production",
  MONGODB_URI: uri,
  JWT_SECRET: randomUUID() + randomUUID(),
  HOST: "",
  PORT: String(port),
  CLIENT_URL: frontend,
  PUBLIC_APP_URL: frontend,
  SEED_DEMO: "false",
  ALLOW_DEMO_LOGIN: "false",
  TRUST_PROXY: "1",
  GEMINI_API_KEY: "",
  CLOUDINARY_CLOUD_NAME: "",
  CLOUDINARY_API_KEY: "",
  CLOUDINARY_API_SECRET: "",
};
const win = process.platform === "win32";
const child = spawn(
  win ? process.env.ComSpec || "cmd.exe" : "npm",
  win ? ["/d", "/s", "/c", "npm.cmd start"] : ["start"],
  {
    cwd: directory,
    env,
    windowsHide: true,
    detached: !win,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let output = "",
  spawnError;
child.stdout.on("data", (b) => (output += b));
child.stderr.on("data", (b) => (output += b));
child.on("error", (e) => (spawnError = e));
const base = "http://127.0.0.1:" + port;
try {
  let ready = false;
  for (let i = 0; i < 200; i++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null)
      throw Error("npm start exited before readiness: " + output);
    try {
      if (
        (
          await fetch(base + "/api/health", {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, "npm start did not become ready");
  assert.ok(
    output.includes("http://0.0.0.0:" + port),
    "Production must bind all interfaces on its dynamic port",
  );
  const allowed = await fetch(base + "/api/health", {
    headers: { Origin: frontend },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), frontend);
  assert.equal((await allowed.json()).database, "connected");
  const denied = await fetch(base + "/api/health", {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  for (const path of ["/api/auth/me", "/api/workers/me", "/api/manage/users"])
    assert.equal((await fetch(base + path)).status, 401, path);
  assert.equal(
    (
      await fetch(base + "/api/auth/digilocker/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal((await fetch(base + "/api/does-not-exist")).status, 404);
  if (!existsSync(resolve(directory, "../client/dist/index.html")))
    assert.equal(
      (await fetch(base + "/")).status,
      404,
      "Backend-only deployment must not attempt a missing SPA index",
    );
  console.log(
    "PASS: npm start from server; compiled ESM/shared imports; dynamic PORT and 0.0.0.0; MongoDB health; Vercel CORS allowed and other origins excluded; private APIs protected; demos disabled; backend-only fallback.",
  );
} finally {
  if (child.pid && child.exitCode === null) {
    if (win) {
      try {
        execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } catch {}
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
    }
  }
  const connection = await mongoose.createConnection(uri).asPromise();
  assert.equal(connection.name, database);
  try {
    assert.equal(
      await connection.collection("users").countDocuments(),
      0,
      "Production must not auto-seed demo users",
    );
    await connection.dropDatabase();
  } finally {
    await connection.close();
  }
}
