import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import sharp from "sharp";
import { videoExecutable } from "../src/video-runtime.js";
import { representativeFrames, videoAnalysisAvailable } from "../src/video.js";
const execute = promisify(execFile);
test("real FFmpeg decodes MP4 and WebM into six bounded chronological JPEG frames and rejects corrupt or overlong clips", async (t) => {
  if (!(await videoAnalysisAvailable())) {
    t.skip("Install both video tools or run npm run setup:video.");
    return;
  }
  const folder = await mkdtemp(join(tmpdir(), "dakshsetu-video-test-"));
  try {
    const mp4 = join(folder, "synthetic.mp4"),
      webm = join(folder, "synthetic.webm");
    const generate = async (
      output: string,
      codec: string,
      duration: string,
      rate = "4",
    ) =>
      execute(
        videoExecutable("ffmpeg"),
        [
          "-v",
          "error",
          "-nostdin",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=320x180:rate=" + rate,
          "-t",
          duration,
          "-an",
          "-c:v",
          codec,
          "-threads",
          "1",
          "-y",
          output,
        ],
        { windowsHide: true, timeout: 30000, maxBuffer: 128000 },
      );
    await generate(mp4, "libx264", "3");
    await generate(webm, "libvpx-vp9", "3");
    for (const [file, mime] of [
      [mp4, "video/mp4"],
      [webm, "video/webm"],
    ]) {
      const result = await representativeFrames(await readFile(file), mime);
      assert.equal(result.frames.length, 6);
      assert.equal(result.times[0], 0);
      assert.ok(result.times[5] > 2);
      for (let i = 0; i < 6; i++) {
        const metadata = await sharp(result.frames[i]).metadata();
        assert.equal(metadata.format, "jpeg");
        assert.equal(metadata.width, 640);
        if (i) assert.ok(result.times[i] > result.times[i - 1]);
      }
    }
    const corrupt = Buffer.alloc(100);
    corrupt.write("ftyp", 4);
    await assert.rejects(
      representativeFrames(corrupt, "video/mp4"),
      /decoded safely/,
    );
    const sparse = join(folder, "sparse.mp4");
    await generate(sparse, "libx264", "1", "1");
    assert.equal(
      (await representativeFrames(await readFile(sparse), "video/mp4")).frames
        .length,
      6,
    );
    const overlong = join(folder, "long.mp4");
    await generate(overlong, "libx264", "61");
    await assert.rejects(
      representativeFrames(await readFile(overlong), "video/mp4"),
      /60 seconds/,
    );
  } finally {
    if (
      dirname(resolve(folder)) === resolve(tmpdir()) &&
      basename(folder).startsWith("dakshsetu-video-test-")
    )
      await rm(folder, { recursive: true, force: true });
  }
});
test("missing video tools report the explicit manual-review fallback", async () => {
  const code = `import {representativeFrames} from './src/video.ts';const bytes=Buffer.alloc(100);bytes.write('ftyp',4);try{await representativeFrames(bytes,'video/mp4');process.exitCode=1}catch(e){if(e.code!=='VIDEO_ANALYSIS_UNAVAILABLE'||e.status!==503)throw e;console.log('manual-fallback-pass')}`;
  const { stdout } = await execute(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code],
    {
      cwd: resolve(process.cwd().endsWith("server") ? "." : "server"),
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 128000,
      env: {
        ...process.env,
        FFMPEG_PATH: "dakshsetu-test-missing-ffmpeg",
        FFPROBE_PATH: "dakshsetu-test-missing-ffprobe",
      },
    },
  );
  assert.match(stdout, /manual-fallback-pass/);
});
