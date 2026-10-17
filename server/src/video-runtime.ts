import { existsSync } from "node:fs";
import { resolve } from "node:path";
export function videoExecutable(name: "ffmpeg" | "ffprobe") {
  const configured =
    process.env[name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"];
  if (configured) return configured;
  const projectRoot = existsSync(resolve("server/package.json"))
    ? process.cwd()
    : resolve("..");
  const local = resolve(
    projectRoot,
    ".tools/ffmpeg/bin",
    name + (process.platform === "win32" ? ".exe" : ""),
  );
  return existsSync(local) ? local : name;
}
