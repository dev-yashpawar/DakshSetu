import { readdir, lstat, mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "output");
const files = [];
async function include(path) {
  const full = resolve(root, path);
  if (relative(root, full).startsWith(".."))
    throw Error("Invalid package path");
  const info = await lstat(full);
  if (info.isSymbolicLink())
    throw Error("Symlinks are not allowed in the deployment source package");
  if (info.isDirectory()) {
    for (const item of await readdir(full)) {
      if (
        /^(node_modules|dist|data|uploads|\.git|\.env(?:\..*)?|\.npmrc)$/.test(
          item,
        ) ||
        /\.(?:log|pem|key)$/i.test(item)
      )
        continue;
      await include(path + "/" + item);
    }
  } else {
    if (path.endsWith(".npmrc")) {
      const lines = (await readFile(full, "utf8"))
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(
          (line) => line && !line.startsWith("#") && !line.startsWith(";"),
        );
      if (lines.some((line) => !/^include\s*=\s*dev$/.test(line)))
        throw Error(
          "Only public include=dev npm configuration may enter the deployment archive.",
        );
    }
    files.push(path.replaceAll("\\", "/"));
  }
}
for (const path of [
  "package.json",
  "package-lock.json",
  "Dockerfile",
  "render.yaml",
  ".dockerignore",
  ".gitignore",
  ".npmrc",
  "server/.npmrc",
  "README.md",
  "DEPLOYMENT.md",
  "server/.env.production.example",
  "client/.env.example",
  "client/package.json",
  "client/tsconfig.json",
  "client/vite.config.ts",
  "client/index.html",
  "client/src",
  "client/public",
  "client/test",
  "server/package.json",
  "server/tsconfig.json",
  "server/src",
  "server/assets",
  "server/test",
  "server/scripts",
  "shared",
  "scripts",
])
  await include(path);
for (const name of await readdir(root)) {
  if (name.endsWith(".md") && !files.includes(name)) await include(name);
}
await mkdir(output, { recursive: true });
files.sort();
const manifest = join(output, "deploy-files.txt"),
  archive = join(output, "dakshsetu-deploy.tar.gz");
await writeFile(manifest, files.join("\n") + "\n");
execFileSync("tar", ["-czf", archive, "-T", manifest], {
  cwd: root,
  windowsHide: true,
});
const entries = execFileSync("tar", ["-tzf", archive], {
  encoding: "utf8",
  windowsHide: true,
})
  .trim()
  .split(/\r?\n/);
if (
  entries.length !== files.length ||
  entries.some((entry, i) => entry !== files[i])
)
  throw Error("Deployment archive inventory mismatch");
const bytes = await readFile(archive),
  sha256 = createHash("sha256").update(bytes).digest("hex");
await writeFile(archive + ".sha256", sha256 + "  dakshsetu-deploy.tar.gz\n");
console.log(
  JSON.stringify({
    archive: "output/dakshsetu-deploy.tar.gz",
    files: entries.length,
    bytes: bytes.length,
    sha256,
    note: "Source package; npm ci and npm run build are required on the target. No local database, environment secrets, node_modules or generated logs.",
  }),
);
