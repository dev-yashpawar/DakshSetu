import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
const root = resolve("client/dist");
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(resolve(dir, entry.name))
          : [resolve(dir, entry.name)],
      ),
    )
  ).flat();
}
const paths = (await files(root))
  .filter(
    (path) =>
      /\.(html|css|js|svg|png|webp|webmanifest)$/.test(path) &&
      !path.endsWith("sw.js"),
  )
  .sort();
const digest = createHash("sha256");
for (const path of paths) digest.update(await readFile(path));
const assets = paths.map(
  (path) => "/" + relative(root, path).replaceAll("\\", "/"),
);
const source = `const CACHE='dakshsetu-shell-${digest.digest("hex").slice(0, 16)}';
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('dakshsetu-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname==='/api'||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate')event.respondWith(fetch(request).then(response=>response.ok?response:caches.match('/index.html')).catch(()=>caches.match('/index.html')));
  else if(ASSETS.includes(url.pathname))event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
});
`;
await writeFile(resolve(root, "sw.js"), source);
console.log(
  `Prepared offline shell: ${assets.length} static assets. Private API responses are excluded.`,
);
