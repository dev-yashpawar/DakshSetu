import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { resolve, join, relative } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url)),
  tools = join(root, ".tools"),
  target = join(tools, "ffmpeg"),
  archive = join(tools, "ffmpeg-9.0.2-essentials_build.zip");
const source =
  "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-9.0.2-essentials_build.zip";
const expected =
  "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba";
if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error(
    "This helper is for Windows x64. Install ffmpeg and ffprobe using your OS package manager, or set FFMPEG_PATH and FFPROBE_PATH.",
  );
for (const path of [target, archive])
  if (relative(tools, resolve(path)).startsWith(".."))
    throw new Error("Invalid tools directory.");
await mkdir(target, { recursive: true });
let installed = false;
try {
  const metadata = JSON.parse(
    await readFile(join(target, "runtime.json"), "utf8"),
  );
  installed =
    metadata.archiveSha256 === expected &&
    (await stat(join(target, "bin/ffmpeg.exe"))).isFile() &&
    (await stat(join(target, "bin/ffprobe.exe"))).isFile();
} catch {}
if (!installed) {
  console.log(
    "Downloading the pinned FFmpeg Windows runtime from the provider linked by ffmpeg.org.",
  );
  const response = await fetch(source, { signal: AbortSignal.timeout(240000) });
  if (!response.ok || !response.body)
    throw Error("Runtime download failed: " + response.status);
  const hash = createHash("sha256");
  let size = 0;
  const validate = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      if (size > 200 * 1024 * 1024)
        return callback(new Error("Runtime archive exceeds size limit."));
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body),
    validate,
    createWriteStream(archive),
  );
  if (hash.digest("hex") !== expected)
    throw Error(
      "FFmpeg archive checksum mismatch. No executable was installed.",
    );
  const extraction = `Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip=[System.IO.Compression.ZipFile]::OpenRead($env:DAKSHSETU_VIDEO_ARCHIVE)
try {
  foreach($taskEntry in $taskZip.Entries) {
    $taskName=($taskEntry.FullName -split '/')[-1]
    if(($taskEntry.FullName -match '/bin/(ffmpeg|ffprobe)\\.exe$') -or ($taskName -in @('LICENSE','LICENSE.txt','README.txt'))) {
      $taskFolder=if($taskName -like '*.exe'){Join-Path $env:DAKSHSETU_VIDEO_TARGET 'bin'}else{$env:DAKSHSETU_VIDEO_TARGET}
      [System.IO.Directory]::CreateDirectory($taskFolder) | Out-Null
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($taskEntry,(Join-Path $taskFolder $taskName),$true)
    }
  }
} finally {$taskZip.Dispose()}`;
  await promisify(execFile)(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", extraction],
    {
      windowsHide: true,
      timeout: 120000,
      env: {
        ...process.env,
        DAKSHSETU_VIDEO_ARCHIVE: archive,
        DAKSHSETU_VIDEO_TARGET: target,
      },
    },
  );
  for (const name of ["ffmpeg", "ffprobe"])
    await stat(join(target, "bin", name + ".exe"));
  await writeFile(
    join(target, "runtime.json"),
    JSON.stringify(
      {
        version: "9.0.2",
        source,
        archiveSha256: expected,
        installedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
}
for (const name of ["ffmpeg", "ffprobe"]) {
  const { stdout } = await promisify(execFile)(
    join(target, "bin", name + ".exe"),
    ["-version"],
    { windowsHide: true, timeout: 10000, maxBuffer: 128000 },
  );
  console.log(stdout.split(/\r?\n/)[0]);
}
console.log(
  "Project-local video runtime ready. No system PATH or secrets were changed. Restart the API if it was already running.",
);
