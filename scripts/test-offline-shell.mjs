import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

// Exercises generated service-worker handlers without automating a browser.
const source = await readFile("client/dist/sw.js", "utf8");
const handlers = new Map(),
  stored = new Map(),
  removed = [];
let claimed = false,
  offline = false,
  installed = [];
const old = "dakshsetu-shell-old",
  unrelated = "other-app-cache";
const context = {
  URL,
  self: {
    location: { origin: "https://dakshsetu.example" },
    clients: {
      claim() {
        claimed = true;
      },
    },
    addEventListener(type, callback) {
      handlers.set(type, callback);
    },
  },
  caches: {
    async open() {
      return {
        async addAll(paths) {
          installed = paths;
          for (const path of paths) stored.set(path, { cached: path });
        },
      };
    },
    async keys() {
      return [old, unrelated];
    },
    async delete(key) {
      removed.push(key);
    },
    async match(request) {
      return stored.get(
        typeof request === "string" ? request : new URL(request.url).pathname,
      );
    },
  },
  async fetch(request) {
    if (offline) throw Error("offline");
    return { ok: true, network: request.url };
  },
};
vm.runInNewContext(source, context);
let task;
handlers.get("install")({
  waitUntil(promise) {
    task = promise;
  },
});
await task;
assert.ok(installed.includes("/index.html"));
assert.ok(installed.includes("/dakshsetu-logo.png"));
assert.ok(installed.includes("/landing-workers-900.webp"));
const chunks = await readdir("client/dist/assets");
for (const chunk of chunks.filter((name) => name.endsWith(".js")))
  assert.ok(
    installed.includes("/assets/" + chunk),
    `Missing lazy chunk ${chunk}`,
  );
assert.equal(
  installed.some((path) => path.startsWith("/api") || path.endsWith(".env")),
  false,
);
handlers.get("activate")({
  waitUntil(promise) {
    task = promise;
  },
});
await task;
assert.deepEqual(removed, [old]);
assert.equal(claimed, true);
function request(path, { method = "GET", mode = "cors" } = {}) {
  let intercepted = false,
    response;
  handlers.get("fetch")({
    request: {
      url: path.startsWith("http") ? path : "https://dakshsetu.example" + path,
      method,
      mode,
    },
    respondWith(promise) {
      intercepted = true;
      response = promise;
    },
  });
  return { intercepted, response };
}
for (const path of [
  "/api",
  "/api/auth/me",
  "/api/passports/private",
  "/api/assessments/private/evidence/content",
  "https://external.example/image.png",
])
  assert.equal(request(path).intercepted, false, path);
assert.equal(request("/worker/quiz", { method: "POST" }).intercepted, false);
assert.equal(
  (await request("/worker/quiz", { mode: "navigate" }).response).network,
  "https://dakshsetu.example/worker/quiz",
);
offline = true;
assert.equal(
  (await request("/worker/quiz", { mode: "navigate" }).response).cached,
  "/index.html",
);
assert.ok(
  (
    await request(
      installed.find(
        (path) => path.includes("Passport") && path.endsWith(".js"),
      ),
    ).response
  ).cached,
);
assert.equal(request("/private-not-listed.png").intercepted, false);
console.log(
  `PASS: generated offline shell caches ${installed.length} static assets and all lazy chunks; offline navigation works; private API, POST and cross-origin requests are excluded.`,
);
