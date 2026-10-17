import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { HttpError } from "./services.js";
import { videoExecutable } from "./video-runtime.js";
const execute = promisify(execFile);
const ffmpeg = () => videoExecutable("ffmpeg"),
  ffprobe = () => videoExecutable("ffprobe");
let capabilities: Promise<boolean> | undefined;
export function videoAnalysisAvailable() {
  return (capabilities ??= Promise.all([
    execute(ffmpeg(), ["-version"], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 128000,
    }),
    execute(ffprobe(), ["-version"], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 128000,
    }),
  ]).then(
    () => true,
    () => false,
  ));
}
// Bound memory and the embedded private media record below MongoDB's document limit.
export const maxVideoBytes = Math.max(1, Math.min(10, Number(process.env.MAX_VIDEO_MB) || 10)) * 1024 * 1024;
export function validateVideo(bytes: Buffer, mime: string) {
  if (!bytes.length || bytes.length > maxVideoBytes)
    throw new HttpError(413, "The video exceeds the configured upload limit.");
  const mp4 = bytes.length > 16 && bytes.toString("ascii", 4, 8) === "ftyp",
    webm = bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (!((mime === "video/mp4" && mp4) || (mime === "video/webm" && webm)))
    throw new HttpError(415, "Choose a valid MP4 or WebM video.");
}
export async function representativeFrames(bytes: Buffer, mime: string, includeEndpoints = false) {
  validateVideo(bytes, mime);
  if (!(await videoAnalysisAvailable()))
    throw new HttpError(
      503,
      "Video analysis is unavailable on this server. The assessor can review the uploaded video manually.",
      "VIDEO_ANALYSIS_UNAVAILABLE",
    );
  const folder = await mkdtemp(join(tmpdir(), "dakshsetu-video-"));
  try {
    const input = join(folder, mime === "video/mp4" ? "clip.mp4" : "clip.webm");
    await writeFile(input, bytes);
    const { stdout } = await execute(
      ffprobe(),
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_entries",
        "format=duration:stream=codec_type,width,height",
        "-of",
        "json",
        input,
      ],
      { windowsHide: true, timeout: 10000, maxBuffer: 128000 },
    );
    const metadata = JSON.parse(stdout),
      duration = Number(metadata.format?.duration),
      video = metadata.streams?.find(
        (s: { codec_type: string }) => s.codec_type === "video",
      );
    if (
      !video ||
      !Number.isInteger(video.width) ||
      !Number.isInteger(video.height) ||
      video.width <= 0 ||
      video.height <= 0 ||
      Math.max(video.width, video.height) > 1920 ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 60 ||
      video.width * video.height > 1920 * 1080
    )
      throw new HttpError(
        415,
        "Use a video up to 60 seconds and 1080p for frame analysis.",
      );
    if (includeEndpoints) {
      // Seek to eight explicit sample positions including the opening and a near-end frame.
      // Sparse/corrupt media that cannot supply these samples falls back to human review.
      const times = Array.from({ length: 8 }, (_, i) => Math.max(0, duration - 0.2) * i / 7);
      const frames: Buffer[] = [];
      for (let i = 0; i < times.length; i++) {
        const output = join(folder, `sample-${i}.jpg`);
        await execute(ffmpeg(), ["-v", "error", "-nostdin", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", input, "-ss", String(times[i]), "-map", "0:v:0", "-an", "-frames:v", "1", "-vf", "scale=640:-2,format=yuvj420p", "-threads", "1", "-y", output], { windowsHide: true, timeout: 20000, maxBuffer: 128000 });
        frames.push(await readFile(output));
      }
      return { frames, times, duration };
    }
    // Resample the bounded video in one pass. Seeking near EOF can yield no frame,
    // particularly for sparse frame rates. Explicit full-range JPEG format is
    // required by newer FFmpeg MJPEG encoders. Sparse inputs may repeat frames.
    await execute(
      ffmpeg(),
      [
        "-v",
        "error",
        "-nostdin",
        "-threads",
        "1",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-an",
        "-frames:v",
        "6",
        "-vf",
        `fps=${6 / duration}:round=down,scale=640:-2,format=yuvj420p`,
        "-threads",
        "1",
        "-y",
        join(folder, "frame-%d.jpg"),
      ],
      { windowsHide: true, timeout: 20000, maxBuffer: 128000 },
    );
    const frames = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        readFile(join(folder, `frame-${i + 1}.jpg`)),
      ),
    );
    const times = Array.from({ length: 6 }, (_, i) => (duration * i) / 6);
    return { frames, times, duration };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      415,
      "The video could not be decoded safely. Use a shorter MP4 or WebM clip.",
    );
  } finally {
    // Delete only the exact scratch directory created for this operation.
    if (
      dirname(resolve(folder)) === resolve(tmpdir()) &&
      basename(folder).startsWith("dakshsetu-video-")
    )
      await rm(folder, { recursive: true, force: true });
  }
}
