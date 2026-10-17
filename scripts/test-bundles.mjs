import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const manifest = JSON.parse(
  await readFile("client/dist/.vite/manifest.json", "utf8"),
);
const entry = Object.values(manifest).find((c) => c.isEntry);
assert.ok(entry);
const initial = new Set();
function visit(key) {
  if (initial.has(key)) return;
  initial.add(key);
  for (const key2 of manifest[key]?.imports ?? []) visit(key2);
}
const entryKey = Object.keys(manifest).find((k) => manifest[k] === entry);
visit(entryKey);
for (const route of [
  "src/pages/Worker.tsx",
  "src/pages/Auth.tsx",
  "src/pages/Info.tsx",
  "src/pages/Assessor.tsx",
  "src/pages/Passport.tsx",
  "src/pages/Quality.tsx",
]) {
  assert.ok(manifest[route], route + " missing from manifest");
  assert.equal(
    initial.has(route),
    false,
    route + " loaded on the landing page",
  );
}
let initialBytes = 0,
  initialGzip = 0,
  maxChunk = 0;
for (const key of initial) {
  const bytes = await readFile("client/dist/" + manifest[key].file);
  initialBytes += bytes.length;
  initialGzip += gzipSync(bytes).length;
}
for (const chunk of Object.values(manifest)) {
  const size = (await stat("client/dist/" + chunk.file)).size;
  maxChunk = Math.max(maxChunk, size);
  assert.ok(size < 500000, chunk.file + " exceeds 500 kB");
}
assert.ok(
  initialBytes < 700000,
  "Initial static JavaScript exceeds the 700 kB regression budget.",
);
console.log(
  JSON.stringify({
    result: "PASS",
    initialStaticBytes: initialBytes,
    initialStaticGzip: initialGzip,
    entryBytes: (await stat("client/dist/" + entry.file)).size,
    maxChunkBytes: maxChunk,
    initialChunks: initial.size,
    note: "Static import graph measurement; offline-shell installation separately prefetches all app chunks. No browser timing/Lighthouse claim.",
  }),
);
