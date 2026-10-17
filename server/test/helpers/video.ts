import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { videoExecutable } from "../../src/video-runtime.js";
export async function syntheticVideo() {
  const folder = await mkdtemp(join(tmpdir(), "dakshsetu-video-fixture-"));
  const cleanup = async () => {
    if (
      dirname(resolve(folder)) === resolve(tmpdir()) &&
      basename(folder).startsWith("dakshsetu-video-fixture-")
    )
      await rm(folder, { recursive: true, force: true });
  };
  try {
    const file = join(folder, "synthetic-test-pattern.mp4");
    await promisify(execFile)(
      videoExecutable("ffmpeg"),
      [
        "-v",
        "error",
        "-nostdin",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=640x360:rate=6",
        "-t",
        "3",
        "-an",
        "-c:v",
        "libx264",
        "-threads",
        "1",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-y",
        file,
      ],
      { windowsHide: true, timeout: 30000, maxBuffer: 128000 },
    );
    return { bytes: await readFile(file), cleanup };
  } catch (e) {
    await cleanup();
    throw e;
  }
}
