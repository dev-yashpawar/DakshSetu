import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import mongoose from "mongoose";
const database = "dakshsetu_smoke_" + randomUUID().replaceAll("-", "");
const uri = "mongodb://127.0.0.1:27027/" + database;
const secret = randomUUID() + randomUUID();
const env = {
  ...process.env,
  NODE_ENV: "production",
  MONGODB_URI: uri,
  JWT_SECRET: secret,
  HOST: "127.0.0.1",
  PORT: "4001",
  SEED_DEMO: "false",
  ALLOW_DEMO_LOGIN: "false",
  TRUST_PROXY: "0",
  PUBLIC_APP_URL: "http://127.0.0.1:4001",
  CLIENT_URL: "http://127.0.0.1:4001",
  GEMINI_API_KEY: "",
  CLOUDINARY_CLOUD_NAME: "",
  CLOUDINARY_API_KEY: "",
  CLOUDINARY_API_SECRET: "",
};
const child = spawn(process.execPath, ["dist/server/src/index.js"], {
  cwd: new URL("../server/", import.meta.url),
  env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
function command(file, args = [], extra = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn(globalThis.process.execPath, [file, ...args], {
      cwd: new URL("../server/", import.meta.url),
      env: { ...env, ...extra },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    process.stdout.on("data", (chunk) => (stdout += chunk));
    process.stderr.on("data", (chunk) => (stderr += chunk));
    process.once("error", reject);
    process.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}
let output = "";
child.stdout.on("data", (chunk) => (output += chunk));
child.stderr.on("data", (chunk) => (output += chunk));
const base = "http://127.0.0.1:4001";
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error("Compiled API exited: " + output);
    try {
      if ((await fetch(base + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "Production API did not become ready");
  const seed = await command("dist/server/src/seed.js", [
    "--qualifications-only",
  ]);
  assert.equal(seed.code, 0);
  const bootstrap = {
    BOOTSTRAP_EMAIL: "admin-smoke@example.test",
    BOOTSTRAP_PASSWORD: "synthetic-" + randomUUID(),
    BOOTSTRAP_ROLE: "admin",
    BOOTSTRAP_NAME: "Synthetic Smoke Admin",
    BOOTSTRAP_PHONE: "9876543210",
  };
  const created = await command(
    "dist/server/src/bootstrap-user.js",
    [],
    bootstrap,
  );
  assert.equal(created.code, 0);
  assert.equal(created.stdout.includes(bootstrap.BOOTSTRAP_PASSWORD), false);
  const duplicate = await command("dist/server/src/bootstrap-user.js", [], {
    ...bootstrap,
    BOOTSTRAP_PASSWORD: "replacement-" + randomUUID(),
  });
  assert.notEqual(duplicate.code, 0);
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: bootstrap.BOOTSTRAP_EMAIL,
      password: bootstrap.BOOTSTRAP_PASSWORD,
    }),
  });
  assert.equal(login.status, 200);
  const token = (await login.json()).token;
  const users = await fetch(base + "/api/admin/users", {
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(users.status, 200);
  const records = await users.json();
  assert.equal(records.total, 1);
  assert.equal(JSON.stringify(records).includes("passwordHash"), false);
  assert.equal(
    (
      await (
        await fetch(base + "/api/admin/qualifications", {
          headers: { Authorization: "Bearer " + token },
        })
      ).json()
    ).length,
    1,
  );
  for (const path of [
    "/api/manage/users",
    "/api/manage/settings",
    "/api/manage/assessors",
    "/api/manage/assessments",
    "/api/manage/batches",
    "/api/manage/analytics",
    "/api/manage/sync",
  ]) {
    const response = await fetch(base + path, {
      headers: { Authorization: "Bearer " + token },
    });
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(
      JSON.stringify(await response.json()).includes("passwordHash"),
      false,
    );
  }
  const managedEmail = "managed-" + randomUUID() + "@example.test",
    managedPassword = "synthetic-" + randomUUID();
  const managed = await fetch(base + "/api/manage/users", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Synthetic managed worker",
      email: managedEmail,
      password: managedPassword,
      phone: "9876543210",
      preferredLanguage: "en",
      role: "worker",
    }),
  });
  assert.equal(managed.status, 201);
  const managedUser = await managed.json();
  const managedLogin = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: managedEmail, password: managedPassword }),
  });
  assert.equal(managedLogin.status, 200);
  const managedToken = (await managedLogin.json()).token;
  assert.equal(
    (
      await fetch(base + "/api/manage/settings", {
        headers: { Authorization: "Bearer " + managedToken },
      })
    ).status,
    403,
  );
  const deactivated = await fetch(
    base + "/api/manage/users/" + managedUser.id,
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        baseVersion: 0,
        role: "worker",
        accountStatus: "INACTIVE",
        reason: "Synthetic production smoke account deactivation.",
      }),
    },
  );
  assert.equal(deactivated.status, 200);
  assert.equal(
    (
      await fetch(base + "/api/auth/me", {
        headers: { Authorization: "Bearer " + managedToken },
      })
    ).status,
    401,
  );
  for (const path of [
    "/",
    "/login/worker",
    "/login/assessor",
    "/login/admin",
    "/register",
    "/worker/dashboard",
    "/worker/profile",
    "/worker/evidence",
    "/admin/users",
    "/admin/settings",
    "/admin/batches",
    "/worker/quiz",
    "/passports/synthetic-id",
    "/admin/audit-log",
    "/admin/quality",
    "/assessor/calibration",
    "/verify/unknown-credential",
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.match(
      response.headers.get("content-security-policy"),
      /img-src 'self' data: blob:/,
    );
    assert.match(await response.text(), /<div id="root"><\/div>/);
  }
  for (const path of [
    "/api/passports/synthetic-id",
    "/api/admin/stats",
    "/api/workers/me",
    "/api/admin/quality",
    "/api/reassessments/assessment/synthetic-id",
    "/api/calibration/cases",
    "/api/manage/users",
    "/api/manage/settings",
    "/api/manage/batches",
    "/api/workers/portal",
  ])
    assert.equal((await fetch(base + path)).status, 401, path);
  assert.equal((await fetch(base + "/api/not-a-route")).status, 404);
  const sw = await fetch(base + "/sw.js");
  assert.equal((await fetch(base + "/digilocker-logo.png")).status, 200);
  assert.equal((await fetch(base + "/api/auth/digilocker/demo", {method:"POST", headers:{"Content-Type":"application/json"}, body:"{}"})).status, 403);
  assert.equal(sw.status, 200);
  assert.equal(sw.headers.get("cache-control"), "no-cache");
  assert.match(await sw.text(), /dakshsetu-shell/);
  assert.equal((await fetch(base + "/dakshsetu-logo.png")).status, 200);
  const manifest = await (await fetch(base + "/manifest.webmanifest")).json();
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((i) => i.sizes === `${size}x${size}`);
    assert.ok(icon);
    const bytes = Buffer.from(
      await (await fetch(base + icon.src)).arrayBuffer(),
    );
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  const quality = await fetch(base + "/api/admin/quality", {
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(quality.status, 200);
  assert.deepEqual((await quality.json()).datasets, []);
  const invalid = await fetch(
    base + "/api/credentials/unknown-credential/verify",
  );
  assert.equal(invalid.status, 404);
  assert.equal((await invalid.json()).status, "NOT_FOUND");
  const scripts = (await readdir("client/dist/assets")).filter((name) =>
    name.endsWith(".js"),
  );
  for (const script of scripts) {
    const content = await readFile("client/dist/assets/" + script, "utf8");
    for (const forbidden of [
      "correctAnswer",
      "GEMINI_API_KEY",
      "CLOUDINARY_API_SECRET",
      secret,
    ])
      assert.equal(
        content.includes(forbidden),
        false,
        "Private value in bundle: " + forbidden,
      );
  }
  const asset = await fetch(base + "/assets/" + scripts[0]);
  assert.match(asset.headers.get("cache-control"), /immutable/);
  console.log(
    "PASS: compiled production API and SPA deep links, private route authentication, health readiness, static cache headers, logo, service worker and client secret/answer-key exclusion.",
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
  });
  const connection = await mongoose.createConnection(uri).asPromise();
  assert.equal(connection.name, database);
  await connection.dropDatabase();
  await connection.close();
}
