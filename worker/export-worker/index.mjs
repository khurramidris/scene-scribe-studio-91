#!/usr/bin/env node
/**
 * Backlot Studio episode export worker.
 *
 * Runs outside the application (the app's serverless runtime cannot execute
 * FFmpeg). It polls the app for a queued export, renders it with FFmpeg and
 * uploads the finished MP4 straight into the app's private storage using a
 * short lived signed upload URL. It never receives database or AI provider
 * credentials — only the shared cron secret.
 *
 * Required environment:
 *   BACKLOT_APP_URL     e.g. https://project--<id>.lovable.app
 *   BACKLOT_CRON_SECRET must match LOVABLE_CRON_SECRET in the app
 * Optional:
 *   POLL_INTERVAL_MS    default 10000
 *   WORK_DIR            default os.tmpdir()/backlot-export
 *   RUN_ONCE=1          process at most one export and exit (used by CI/tests)
 */
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile, readFile, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import os from "node:os";
import path from "node:path";

const APP_URL = (process.env.BACKLOT_APP_URL ?? "").replace(/\/$/, "");
const SECRET = process.env.BACKLOT_CRON_SECRET ?? "";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 10000);
const WORK_DIR = process.env.WORK_DIR ?? path.join(os.tmpdir(), "backlot-export");
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";

if (!APP_URL || !SECRET) {
  console.error("BACKLOT_APP_URL and BACKLOT_CRON_SECRET are required.");
  process.exit(1);
}

const authHeaders = { authorization: `Bearer ${SECRET}` };

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(stderr.slice(-4000) || `exit ${code}`)),
    );
  });
}

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
}

function escapeDrawText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "");
}

/** Normalises one clip so every segment shares dimensions, fps, codec and audio. */
async function normaliseClip(clip, index, job, dir) {
  const source = path.join(dir, `src-${index}.mp4`);
  const output = path.join(dir, `seg-${String(index).padStart(3, "0")}.mp4`);
  await download(clip.url, source);

  const start = Number(clip.trimInSeconds ?? 0);
  const duration = Math.max(
    0.1,
    Number(clip.durationSeconds ?? 0) - start - Number(clip.trimOutSeconds ?? 0),
  );

  const filter = `scale=${job.width}:${job.height}:force_original_aspect_ratio=decrease,pad=${job.width}:${job.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${job.fps},format=yuv420p`;

  const args = ["-y", "-ss", String(start), "-t", String(duration), "-i", source];
  // A silent track keeps concatenation valid when a clip has no audio or is muted.
  args.push("-f", "lavfi", "-t", String(duration), "-i", "anullsrc=r=48000:cl=stereo");
  if (clip.muted) {
    args.push("-filter_complex", `[0:v]${filter}[v]`, "-map", "[v]", "-map", "1:a");
  } else {
    args.push(
      "-filter_complex",
      `[0:v]${filter}[v];[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0[a]`,
      "-map",
      "[v]",
      "-map",
      "[a]",
    );
  }
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-shortest",
    output,
  );

  try {
    await run(FFMPEG, args);
  } catch {
    // Fall back to a silent segment when the source has no usable audio stream.
    await run(FFMPEG, [
      "-y",
      "-ss",
      String(start),
      "-t",
      String(duration),
      "-i",
      source,
      "-f",
      "lavfi",
      "-t",
      String(duration),
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-vf",
      filter,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
      output,
    ]);
  }
  return output;
}

async function renderTitleCard(job, dir) {
  const output = path.join(dir, "title.mp4");
  const title = escapeDrawText(job.titleCard.text || job.episodeTitle || job.projectTitle);
  const subtitle = escapeDrawText(job.titleCard.subtitle ?? "");
  const duration = Math.max(1, Number(job.titleCard.durationSeconds ?? 3));
  const size = Math.round(job.height / 18);

  const draw = [
    `drawtext=text='${title}':fontcolor=white:fontsize=${size}:x=(w-text_w)/2:y=(h-text_h)/2-${size}`,
    subtitle
      ? `drawtext=text='${subtitle}':fontcolor=0xBBBBBB:fontsize=${Math.round(size * 0.55)}:x=(w-text_w)/2:y=(h-text_h)/2+${size}`
      : null,
  ]
    .filter(Boolean)
    .join(",");

  await run(FFMPEG, [
    "-y",
    "-f",
    "lavfi",
    "-t",
    String(duration),
    "-i",
    `color=c=0x0B0B0F:s=${job.width}x${job.height}:r=${job.fps}`,
    "-f",
    "lavfi",
    "-t",
    String(duration),
    "-i",
    "anullsrc=r=48000:cl=stereo",
    "-vf",
    `${draw},format=yuv420p`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-shortest",
    output,
  ]);
  return output;
}

async function renderJob(job) {
  const dir = path.join(WORK_DIR, job.id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const segments = [];
  for (let index = 0; index < job.clips.length; index += 1) {
    segments.push(await normaliseClip(job.clips[index], index, job, dir));
  }

  if (job.titleCard?.enabled) {
    const card = await renderTitleCard(job, dir);
    if (job.titleCard.position === "end") segments.push(card);
    else segments.unshift(card);
  }

  const listFile = path.join(dir, "concat.txt");
  await writeFile(listFile, segments.map((file) => `file '${file}'`).join("\n"), "utf8");

  const joined = path.join(dir, "joined.mp4");
  await run(FFMPEG, [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    joined,
  ]);

  let final = joined;
  if (job.burnSubtitles && job.subtitlesSrt) {
    const srt = path.join(dir, "subs.srt");
    await writeFile(srt, job.subtitlesSrt, "utf8");
    final = path.join(dir, "final.mp4");
    await run(FFMPEG, [
      "-y",
      "-i",
      joined,
      "-vf",
      `subtitles=${srt}:force_style='FontSize=18,Outline=1'`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      final,
    ]);
  }

  const bytes = await readFile(final);
  const info = await stat(final);

  const upload = await fetch(job.upload.url, {
    method: "PUT",
    headers: { "content-type": "video/mp4", "x-upsert": "true" },
    body: bytes,
  });
  if (!upload.ok) throw new Error(`Upload failed with status ${upload.status}`);

  await rm(dir, { recursive: true, force: true });
  return { storagePath: job.upload.path, fileSizeBytes: info.size };
}

/** Also advances active video renders so jobs finish with every browser closed. */
async function tickVideoJobs() {
  try {
    const response = await fetch(`${APP_URL}/api/public/cron/tick`, {
      method: "POST",
      headers: authHeaders,
    });
    if (!response.ok) console.error("video tick failed", response.status);
  } catch (cause) {
    console.error("video tick error", cause);
  }
}

async function tick() {
  await tickVideoJobs();
  const response = await fetch(`${APP_URL}/api/public/exports/claim`, {
    method: "POST",
    headers: authHeaders,
  });
  if (!response.ok) {
    console.error("claim failed", response.status, await response.text());
    return false;
  }
  const { job } = await response.json();
  if (!job) return false;

  console.log(`rendering export ${job.id} (${job.clips.length} clips)`);
  try {
    const result = await renderJob(job);
    await fetch(`${APP_URL}/api/public/exports/complete`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ exportId: job.id, ok: true, ...result }),
    });
    console.log(`export ${job.id} completed (${result.fileSizeBytes} bytes)`);
  } catch (cause) {
    console.error(`export ${job.id} failed`, cause);
    await fetch(`${APP_URL}/api/public/exports/complete`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        exportId: job.id,
        ok: false,
        error: cause instanceof Error ? cause.message : "Render failed",
      }),
    });
  }
  return true;
}

const runOnce = process.env.RUN_ONCE === "1";
if (runOnce) {
  const did = await tick();
  console.log(did ? "done" : "nothing queued");
  process.exit(0);
}

console.log(`Backlot export worker polling ${APP_URL} every ${POLL_INTERVAL_MS}ms`);
for (;;) {
  try {
    const busy = await tick();
    if (!busy) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  } catch (cause) {
    console.error("worker tick error", cause);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
