/**
 * Build-time photo pipeline.
 *
 * Run with `npm run ingest`. Reads every category folder under
 * content/categories/, and content/about/, and:
 *
 *   1. Auto-orients each photo from its EXIF tag and reads its true
 *      (post-rotation) pixel dimensions.
 *   2. Emits AVIF derivatives at up to three widths (720/1440/2560,
 *      clamped to the source so nothing is upscaled) into public/media/.
 *   3. Emits a tiny base64 AVIF LQIP placeholder for instant blur-up.
 *   4. Computes an average luminance (0..1) so overlay text can pick
 *      black or white without a designer eyeballing every photo.
 *   5. Writes data/manifest.json, the single file every page reads from.
 *
 * Video files in a category folder (the wigglegrams) go through the same
 * shape: a still poster frame is run through every step above, so a clip is
 * a Photo like any other and lays out like any other, and alongside it
 * ffmpeg bakes the loop itself into short muted mp4s. See the video section
 * further down for what "the loop itself" means here.
 *
 * Idempotent: each source file's content hash is cached in
 * data/.ingest-cache.json. Re-running after adding one photo to an
 * existing category only processes that one photo.
 */

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import matter from "gray-matter";
import sharp from "sharp";
import type { Metadata } from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CATEGORIES_DIR = path.join(ROOT, "content", "categories");
const ABOUT_DIR = path.join(ROOT, "content", "about");
const MEDIA_DIR = path.join(ROOT, "public", "media");
const MANIFEST_PATH = path.join(ROOT, "data", "manifest.json");
const CACHE_PATH = path.join(ROOT, "data", ".ingest-cache.json");

/**
 * Derivative widths. The gaps matter as much as the endpoints: a browser
 * rounds *up* to the next candidate, so a 1440 -> 2560 jump means a laptop
 * asking for ~1850px of image is handed 4.3 megapixels and pays ~85ms of
 * AVIF decode for it, where 1920 would have cost ~45ms. The intermediate
 * steps exist to keep decoded pixels close to painted pixels.
 */
const WIDTHS = [720, 1080, 1440, 1920, 2560] as const;

/**
 * 4:2:0 chroma subsampling. Sharp defaults AVIF to 4:4:4, which keeps full
 * chroma resolution — worth it for text and screenshots, not for
 * photographs, where it costs a third of the file size (and a proportional
 * share of the decode) for a difference nobody can see.
 */
const AVIF_OPTIONS = {
  quality: 65,
  effort: 4,
  chromaSubsampling: "4:2:0",
} as const;

/**
 * Bumped whenever the encode settings or the width list change, so a
 * re-run regenerates derivatives instead of trusting a cache keyed only on
 * the source file's contents (which haven't changed — the pipeline has).
 */
const PIPELINE_VERSION = "2";

const LQIP_WIDTH = 24;
const IMAGE_EXT = /\.(jpe?g|png|tiff?|webp|avif)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;

/**
 * Video derivative widths. Two rungs, not five: a clip is only ever painted
 * into the same tiles the photos use (~480px on the homepage, ~550px for a
 * category's lead), so 1080 covers a 2x screen and 720 covers everything
 * else. Unlike an <img>, a <video> has no srcset — the component picks one
 * of these once, from the box it measured, so extra rungs would be extra
 * bytes in the repo that nothing ever asks for.
 */
const VIDEO_WIDTHS = [720, 1080] as const;

/** Per-width x264 quality. Grain is what costs here, so 1080 gets the finer one. */
const VIDEO_CRF: Record<(typeof VIDEO_WIDTHS)[number], number> = {
  720: 27,
  1080: 26,
};

/**
 * How long a baked clip should run before it hands back to `<video loop>`.
 * One wiggle cycle is 0.5-1s, and a browser's loop seam is the one place a
 * hitch could show, so the cycle is repeated until the file is about this
 * long: the seam still exists, it just comes round a third as often.
 */
const VIDEO_TARGET_SECONDS = 3;
const VIDEO_MAX_CYCLES = 8;

/** Bumped alongside VIDEO_* the way PIPELINE_VERSION is for stills. */
const VIDEO_PIPELINE_VERSION = "1";

type PhotoSource = Record<`w${(typeof WIDTHS)[number]}`, string>;
type VideoSource = Record<`w${(typeof VIDEO_WIDTHS)[number]}`, string>;

interface VideoClip {
  src: VideoSource;
  /** Of the encoded clip, after duplicated source frames are dropped. */
  fps: number;
  /** Unique frames in one wiggle cycle. */
  frames: number;
  /** Seconds of one wiggle cycle. */
  cycle: number;
  /** Seconds of the encoded file: `cycle` times however many are baked in. */
  duration: number;
}

interface Photo {
  id: string;
  src: PhotoSource;
  width: number;
  height: number;
  orientation: "landscape" | "portrait" | "square";
  lqip: string;
  luminance: number;
  alt: string;
  /** Present only for a video item; the fields above then describe its poster. */
  video?: VideoClip;
}

interface Category {
  slug: string;
  title: string;
  caption: string;
  date: string;
  blurb: string;
  order: number;
  cover: Photo;
  photos: Photo[];
}

interface AboutContent {
  title: string;
  bio: string;
  contactEmail: string;
  contactLinks: { label: string; href: string }[];
  photo: Photo | null;
}

interface CacheEntry {
  hash: string;
  photo: Photo;
}
type Cache = Record<string, CacheEntry>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * `photoOrder` (written by `npm run admin`) is a filename list expressing a
 * manual drag-and-drop order. Files it names come first, in that order;
 * anything not listed (new photos added since the last reorder) falls back
 * to natural sort and is appended after.
 */
function applyPhotoOrder(files: string[], photoOrder: unknown): string[] {
  if (!Array.isArray(photoOrder)) return files;
  const present = new Set(files);
  const known = photoOrder.filter(
    (f): f is string => typeof f === "string" && present.has(f)
  );
  const seen = new Set(known);
  const rest = files.filter((f) => !seen.has(f));
  return [...known, ...rest];
}

/**
 * gray-matter parses unquoted YAML dates (e.g. `date: 2026-01-10`) into a
 * JS Date, which would otherwise land in the manifest as a verbose string
 * like "Sat Jan 10 2026 00:00:00 GMT+0000". Normalize back to YYYY-MM-DD.
 */
function formatDate(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function humanizeFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  // Strip a leading ordering prefix like "01-" or "01_" before humanizing.
  const withoutIndex = base.replace(/^\d+[-_.\s]+/, "");
  const words = withoutIndex.replace(/[-_]+/g, " ").trim();
  return words.length > 0
    ? words.charAt(0).toUpperCase() + words.slice(1)
    : base;
}

/**
 * EXIF orientation 5-8 are 90/270deg rotations, so the physical (rotated)
 * dimensions have width/height swapped relative to the raw file metadata.
 */
function rotatedDimensions(meta: Metadata): { width: number; height: number } {
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (meta.orientation && meta.orientation >= 5) {
    return { width: height, height: width };
  }
  return { width, height };
}

function orientationOf(width: number, height: number): Photo["orientation"] {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

async function hashFile(filePath: string, extra = ""): Promise<string> {
  const buf = await readFile(filePath);
  return createHash("sha1")
    .update(PIPELINE_VERSION)
    .update(WIDTHS.join(","))
    .update(JSON.stringify(AVIF_OPTIONS))
    .update(extra)
    .update(buf)
    .digest("hex");
}

/** The settings half of a video's cache key — see hashFile's `extra`. */
function videoSettingsKey(): string {
  return [
    VIDEO_PIPELINE_VERSION,
    VIDEO_WIDTHS.join(","),
    JSON.stringify(VIDEO_CRF),
    VIDEO_TARGET_SECONDS,
    VIDEO_MAX_CYCLES,
  ].join("|");
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * The categories in the manifest as it stands, before this run rewrites it.
 *
 * These are the fallback for a category whose originals are not on this
 * machine. See "sources missing" in processCategory: without them, running
 * ingest from a fresh clone or worktree quietly deletes the whole archive.
 */
async function loadPublishedCategories(): Promise<Map<string, Category>> {
  try {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf-8"));
    const published: Category[] = Array.isArray(manifest.categories)
      ? manifest.categories
      : [];
    return new Map(published.map((c) => [c.slug, c]));
  } catch {
    return new Map();
  }
}

async function loadCache(): Promise<Cache> {
  try {
    return JSON.parse(await readFile(CACHE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Core: process one source image into derivatives + Photo metadata
// ---------------------------------------------------------------------------

interface SourceRef {
  sourcePath: string;
  outDir: string;
  outPublicPrefix: string; // e.g. /media/tokyo-nights
  id: string;
  alt: string;
}

/**
 * A cache hit is only a hit if the files it claims to have written are still
 * on disk. Check the paths the entry actually recorded, not the nominal
 * widths: derivatives are named for their *clamped* width, so a 1358px
 * original never produces an `id-2560.avif` — probing for one would declare
 * the cache stale on every run and re-encode the whole archive.
 */
async function cacheHit(
  cache: Cache,
  cacheKey: string,
  hash: string
): Promise<Photo | null> {
  const cached = cache[cacheKey];
  if (!cached || cached.hash !== hash) return null;

  const outputs = new Set([
    ...Object.values(cached.photo.src),
    ...Object.values(cached.photo.video?.src ?? {}),
  ]);
  const present = await Promise.all(
    [...outputs].map((publicPath) => pathExists(path.join(ROOT, "public", publicPath)))
  );
  return present.every(Boolean) ? cached.photo : null;
}

async function processImage(
  opts: SourceRef & { cache: Cache; cacheKey: string }
): Promise<Photo> {
  const hash = await hashFile(opts.sourcePath);
  const hit = await cacheHit(opts.cache, opts.cacheKey, hash);
  if (hit) return hit;

  const photo = await buildPhoto(opts);
  opts.cache[opts.cacheKey] = { hash, photo };
  return photo;
}

/** The derivatives themselves, with no cache in the way. */
async function buildPhoto(opts: SourceRef): Promise<Photo> {
  const { sourcePath, outDir, outPublicPrefix, id, alt } = opts;

  await mkdir(outDir, { recursive: true });

  const base = sharp(sourcePath).rotate(); // auto-orient from EXIF
  const meta = await sharp(sourcePath).metadata();
  const { width: fullWidth, height: fullHeight } = rotatedDimensions(meta);
  const orientation = orientationOf(fullWidth, fullHeight);

  // Generate each width, clamping to the source so we never upscale.
  // Widths that clamp to the same value reuse the same file.
  const src: Partial<PhotoSource> = {};
  const generatedAtWidth = new Map<number, string>();
  for (const targetWidth of WIDTHS) {
    const clamped = Math.min(targetWidth, fullWidth);
    const key = `w${targetWidth}` as keyof PhotoSource;
    const filename = `${id}-${clamped}.avif`;
    const outPath = path.join(outDir, filename);
    const publicPath = `${outPublicPrefix}/${filename}`;

    if (!generatedAtWidth.has(clamped)) {
      await base
        .clone()
        .resize({ width: clamped, withoutEnlargement: true })
        .avif(AVIF_OPTIONS)
        .toFile(outPath);
      generatedAtWidth.set(clamped, publicPath);
    }
    src[key] = generatedAtWidth.get(clamped)!;
  }

  // LQIP: tiny blurred AVIF, inlined as a data URI.
  const lqipBuffer = await base
    .clone()
    .resize({ width: LQIP_WIDTH })
    .blur(2)
    .avif({ quality: 35, effort: 2 })
    .toBuffer();
  const lqip = `data:image/avif;base64,${lqipBuffer.toString("base64")}`;

  // Average luminance, cheap: shrink first, then read channel means.
  const stats = await base.clone().resize({ width: 32 }).stats();
  const [r, g, b] = stats.channels;
  const luminance =
    (0.2126 * r.mean + 0.7152 * g.mean + 0.0722 * b.mean) / 255;

  return {
    id,
    src: src as PhotoSource,
    width: fullWidth,
    height: fullHeight,
    orientation,
    lqip,
    luminance: Math.round(luminance * 1000) / 1000,
    alt,
  };
}

// ---------------------------------------------------------------------------
// Core: process one source video into a looping clip + its poster frame
// ---------------------------------------------------------------------------

/** Probe frames are decoded this small: enough to compare, cheap to hold. */
const PROBE_W = 48;
const PROBE_H = 64;
const PROBE_SIZE = PROBE_W * PROBE_H;

/** Mean 8-bit difference below which two probe frames count as the same. */
const LOOP_EPS = 1.0;

const execFileAsync = promisify(execFile);

let ffmpegProbe: Promise<boolean> | null = null;

/**
 * ffmpeg is only needed to *add or change* a video, and the encoded clips are
 * committed like every other derivative, so a checkout without it can still
 * run ingest for the photos. Checked once per run.
 */
function hasFfmpeg(): Promise<boolean> {
  ffmpegProbe ??= Promise.all([
    execFileAsync("ffmpeg", ["-version"]),
    execFileAsync("ffprobe", ["-version"]),
  ]).then(
    () => true,
    () => false
  );
  return ffmpegProbe;
}

/** ffmpeg writing raw bytes to stdout, collected into one buffer. */
function ffmpegCapture(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(Buffer.concat(err).toString().trim() || `ffmpeg exited ${code}`));
    });
  });
}

interface VideoMeta {
  width: number;
  height: number;
  fpsNum: number;
  fpsDen: number;
}

async function probeVideo(sourcePath: string): Promise<VideoMeta> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,r_frame_rate",
    "-of",
    "json",
    sourcePath,
  ]);
  const stream = JSON.parse(stdout).streams?.[0];
  if (!stream?.width || !stream?.height) {
    throw new Error(`no video stream in ${path.basename(sourcePath)}`);
  }
  const [num, den] = String(stream.r_frame_rate ?? "25/1").split("/").map(Number);
  return {
    width: stream.width,
    height: stream.height,
    fpsNum: num > 0 ? num : 25,
    fpsDen: den > 0 ? den : 1,
  };
}

interface Loop {
  /** Source frames until the clip starts repeating itself. */
  period: number;
  /** Source frames each distinct picture is held for. */
  hold: number;
}

/**
 * A wigglegram is three or four frames rocked back and forth, and the file
 * that comes off the camera is that handful already repeated out to 5-20
 * seconds, usually with each picture held over several frames to reach
 * 30fps. Both are duplication, and duplication is not free here: h264 codes
 * a repeat of a grainy film frame against a *lossy* reconstruction of it,
 * which costs nearly what the frame cost the first time. Left alone, the
 * eleven clips in one category weigh 190MB and encode to 30MB of loop that
 * shows four pictures.
 *
 * So the source is decoded once at thumbnail size and read for two numbers,
 * which between them say what is actually in the file:
 *
 *   period — frames before it starts over. This is the wiggle; everything
 *            after it is a copy of it.
 *   hold   — frames each picture is held for. Dropping the held copies and
 *            lowering the frame rate to match plays back identically on a
 *            quarter of the frames.
 *
 * Anything that isn't a loop (a clip that never repeats) comes back
 * period = frame count, hold = 1, and is encoded whole.
 */
function detectLoop(frames: Buffer, count: number): Loop {
  const meanDiff = (a: number, b: number): number => {
    const ao = a * PROBE_SIZE;
    const bo = b * PROBE_SIZE;
    let sum = 0;
    for (let i = 0; i < PROBE_SIZE; i++) sum += Math.abs(frames[ao + i] - frames[bo + i]);
    return sum / PROBE_SIZE;
  };

  // The period has to hold across the whole clip, not just the first pair:
  // a wiggle that happens to pass back through a similar frame mid-cycle
  // would otherwise be read as a loop half its real length.
  let period = count;
  for (let p = 1; p <= Math.floor(count / 2); p++) {
    let repeats = true;
    for (let i = 0; i + p < count; i++) {
      if (meanDiff(i, i + p) >= LOOP_EPS) {
        repeats = false;
        break;
      }
    }
    if (repeats) {
      period = p;
      break;
    }
  }

  // Within one cycle, the frames where the picture actually changes. A hold
  // of 4 puts those at 4, 8, 12…, so their greatest common divisor is the
  // hold. A threshold relative to the largest change in the cycle keeps
  // grain and compression noise from reading as a change of picture.
  const diffs: number[] = [];
  for (let i = 1; i < period; i++) diffs.push(meanDiff(i - 1, i));
  const eps = Math.max(0.35, Math.max(0, ...diffs) * 0.05);

  let hold = 0;
  for (let i = 1; i < period; i++) {
    if (diffs[i - 1] > eps) hold = gcd(hold, i);
  }
  return { period, hold: hold > 0 && period % hold === 0 ? hold : 1 };
}

/**
 * One derivative: the wiggle, its held duplicates dropped, repeated until
 * the file is about VIDEO_TARGET_SECONDS long.
 */
async function encodeClip(opts: {
  sourcePath: string;
  outPath: string;
  meta: VideoMeta;
  loop: Loop;
  cycles: number;
  width: number;
  crf: number;
}): Promise<void> {
  const { sourcePath, outPath, meta, loop, cycles, width, crf } = opts;
  const unique = loop.period / loop.hold;
  const rate = `${meta.fpsNum}/${meta.fpsDen * loop.hold}`;

  const filters = [
    // One cycle, and of that only the frames where the picture changes.
    `select='lt(n\\,${loop.period})*not(mod(n\\,${loop.hold}))'`,
    `scale=${width}:-2:flags=lanczos`,
    "setsar=1",
    ...(cycles > 1 ? [`loop=loop=${cycles - 1}:size=${unique}:start=0`] : []),
    // select and loop both pass the source's own timestamps through, which
    // after dropping three frames in four describes a clip that stalls and
    // then plays the same second again — and the muxer drops every frame
    // whose timestamp it has already seen. Restamp at the new rate.
    `setpts=N/(${rate})/TB`,
  ].join(",");

  await execFileAsync("ffmpeg", [
    "-v", "error",
    "-y",
    "-i", sourcePath,
    // Nothing but picture: these autoplay, so a muted audio track would be
    // bytes that can never be heard, and a stray subtitle or data stream
    // would only stand between the file and its first frame.
    "-an", "-sn", "-dn",
    "-vf", filters,
    "-r", rate,
    "-c:v", "libx264",
    "-profile:v", "high",
    "-crf", String(crf),
    "-preset", "slow",
    // Twelve reference frames, so a baked repeat predicts from the identical
    // frame one cycle back instead of from the nearest wiggle neighbour.
    // With the default four it can't reach that far, and every extra cycle
    // costs as much as the first one did. The deeper buffer is what puts
    // these at H.264 level 5.0, which is far inside what any browser that
    // can decode the AVIFs next to them will play.
    "-refs", "12",
    // A cycle boundary looks like a cut, and both of these exist to stop the
    // encoder treating it as one and spending a fresh keyframe on it.
    "-bf", "0",
    "-sc_threshold", "0",
    "-g", "9999",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outPath,
  ]);
}

async function processVideo(
  opts: SourceRef & { cache: Cache; cacheKey: string }
): Promise<Photo | null> {
  const hash = await hashFile(opts.sourcePath, videoSettingsKey());
  const hit = await cacheHit(opts.cache, opts.cacheKey, hash);
  if (hit) return hit;

  const { sourcePath, outDir, outPublicPrefix, id } = opts;
  const name = path.basename(sourcePath);

  if (!(await hasFfmpeg())) {
    console.warn(`  ! skipping "${name}": needs ffmpeg on PATH (brew install ffmpeg)`);
    return null;
  }

  const meta = await probeVideo(sourcePath);
  const probeFrames = await ffmpegCapture([
    "-v", "error",
    "-i", sourcePath,
    "-an",
    "-vf", `scale=${PROBE_W}:${PROBE_H}`,
    "-pix_fmt", "gray",
    "-f", "rawvideo",
    "-",
  ]);
  const frameCount = Math.floor(probeFrames.length / PROBE_SIZE);
  if (frameCount === 0) throw new Error(`no frames decoded from ${name}`);

  const loop = detectLoop(probeFrames, frameCount);
  const sourceFps = meta.fpsNum / meta.fpsDen;
  const cycle = loop.period / sourceFps;
  const cycles = Math.max(
    1,
    Math.min(VIDEO_MAX_CYCLES, Math.round(VIDEO_TARGET_SECONDS / cycle))
  );
  const unique = loop.period / loop.hold;

  console.log(
    `    · ${name}: ${unique} frame loop of ${cycle.toFixed(2)}s, baked ${cycles}x`
  );

  await mkdir(outDir, { recursive: true });

  // Same clamping rule as the stills: never upscale, and reuse one file for
  // any two rungs that clamp to the same width. x264 also needs both
  // dimensions even, which `scale=w:-2` handles for the height.
  const src: Partial<VideoSource> = {};
  const encodedAtWidth = new Map<number, string>();
  for (const targetWidth of VIDEO_WIDTHS) {
    const clamped = Math.min(targetWidth, meta.width) & ~1;
    const key = `w${targetWidth}` as keyof VideoSource;
    const filename = `${id}-${clamped}.mp4`;

    if (!encodedAtWidth.has(clamped)) {
      await encodeClip({
        sourcePath,
        outPath: path.join(outDir, filename),
        meta,
        loop,
        cycles,
        width: clamped,
        crf: VIDEO_CRF[targetWidth],
      });
      encodedAtWidth.set(clamped, `${outPublicPrefix}/${filename}`);
    }
    src[key] = encodedAtWidth.get(clamped)!;
  }

  // The poster is frame one of the loop, run through the still pipeline like
  // any photograph: it is what the grid shows before a clip is asked to
  // play, what fills the frame while the video is still on the wire, and
  // what the layout measures itself against.
  const scratch = await mkdtemp(path.join(tmpdir(), "ingest-poster-"));
  try {
    const posterPath = path.join(scratch, `${id}.png`);
    await execFileAsync("ffmpeg", [
      "-v", "error",
      "-y",
      "-i", sourcePath,
      "-frames:v", "1",
      "-f", "image2",
      "-c:v", "png",
      posterPath,
    ]);

    const poster = await buildPhoto({ ...opts, sourcePath: posterPath });
    const photo: Photo = {
      ...poster,
      video: {
        src: src as VideoSource,
        fps: Math.round((sourceFps / loop.hold) * 1000) / 1000,
        frames: unique,
        cycle: Math.round(cycle * 1000) / 1000,
        duration: Math.round(cycle * cycles * 1000) / 1000,
      },
    };

    opts.cache[opts.cacheKey] = { hash, photo };
    return photo;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Category + about processing
// ---------------------------------------------------------------------------

async function processCategory(
  folderName: string,
  cache: Cache,
  published: Map<string, Category>
): Promise<Category | null> {
  const dir = path.join(CATEGORIES_DIR, folderName);
  const entries = await readdir(dir, { withFileTypes: true });
  const metaFile = entries.find((e) => e.isFile() && e.name === "meta.md");
  if (!metaFile) {
    console.warn(`  ! skipping "${folderName}": no meta.md found`);
    return null;
  }

  const raw = await readFile(path.join(dir, "meta.md"), "utf-8");
  const { data: fm } = matter(raw);
  const slug = slugify(fm.slug ?? folderName);

  // Everything a category is apart from its pictures. Split out because the
  // two paths below (pictures processed here, or pictures carried over from
  // the last run) should differ in nothing else: editing a title or an
  // `order:` has to work in a checkout that has no originals in it.
  const meta = {
    slug,
    title: fm.title ?? folderName,
    caption: fm.caption ?? fm.title ?? folderName,
    date: formatDate(fm.date),
    blurb: fm.blurb ?? "",
    order: typeof fm.order === "number" ? fm.order : 999,
  };

  const mediaFiles = applyPhotoOrder(
    entries
      .filter((e) => e.isFile() && (IMAGE_EXT.test(e.name) || VIDEO_EXT.test(e.name)))
      .map((e) => e.name)
      .sort(naturalSort),
    fm.photoOrder
  );

  if (mediaFiles.length === 0) {
    return withoutSources(folderName, meta, published);
  }

  // The chosen cover can be named anything (e.g. `thumbnail.jpg`), which
  // often sorts after the numbered shoot photos — trimming the naturally
  // sorted list to 15 would silently drop it. Reserve its slot first, cap
  // the rest at 15, then add it back so it's never the one that gets cut.
  const coverSlug = slugify(fm.cover ?? "");
  const coverFile = coverSlug
    ? mediaFiles.find(
        (f) => slugify(path.basename(f, path.extname(f))) === coverSlug
      )
    : undefined;
  const restFiles = coverFile
    ? mediaFiles.filter((f) => f !== coverFile)
    : mediaFiles;

  if (restFiles.length > 15) {
    console.warn(
      `  ! "${folderName}" has ${mediaFiles.length} photos, plan calls for 5-15, trimming to first 15`
    );
  }
  const selected = coverFile
    ? [...restFiles.slice(0, 15), coverFile]
    : restFiles.slice(0, 15);

  const outDir = path.join(MEDIA_DIR, slug);
  const outPublicPrefix = `/media/${slug}`;

  console.log(`  · ${slug} (${selected.length} photos)`);

  const photos: Photo[] = [];
  for (const filename of selected) {
    const id = slugify(path.basename(filename, path.extname(filename)));
    const ref = {
      sourcePath: path.join(dir, filename),
      outDir,
      outPublicPrefix,
      id,
      alt: humanizeFilename(filename) || fm.title || slug,
      cache,
      cacheKey: `${slug}/${filename}`,
    };
    // A video comes back as a Photo (its poster) carrying the clip, so
    // everything downstream — ordering, the cover, the manifest, the page —
    // treats the two the same. Null only when ffmpeg is missing, which
    // leaves the rest of the category to ingest normally.
    const photo = VIDEO_EXT.test(filename)
      ? await processVideo(ref)
      : await processImage(ref);
    if (photo) photos.push(photo);
  }

  if (photos.length === 0) {
    return withoutSources(folderName, meta, published);
  }

  const coverPhoto =
    photos.find((p) => p.id === slugify(fm.cover ?? "")) ?? photos[0];

  return { ...meta, cover: coverPhoto, photos };
}

/**
 * A category folder with a meta.md and nothing to ingest.
 *
 * Almost always this is a checkout that doesn't have the originals: they are
 * gitignored, so every fresh clone and every new worktree starts out like
 * this, while `public/media/**` and the manifest are checked in and complete.
 * Dropping the category there would delete a published set of derivatives
 * (see cleanupOrphans) over nothing more than which machine ingest ran on.
 * So the pictures from the last run are carried forward, under whatever the
 * meta.md says now.
 *
 * Nothing is lost when the folder really is empty on purpose: it was already
 * dropped from the manifest that is being read here, so there is nothing to
 * carry, and the warning says what to do instead.
 */
function withoutSources(
  folderName: string,
  meta: Omit<Category, "cover" | "photos">,
  published: Map<string, Category>
): Category | null {
  const previous = published.get(meta.slug);
  if (!previous) {
    console.warn(`  ! skipping "${folderName}": no photos or videos found`);
    return null;
  }

  console.log(
    `  · ${meta.slug} (${previous.photos.length} photos, none on this machine: ` +
      `keeping what is in the manifest)`
  );
  return { ...meta, cover: previous.cover, photos: previous.photos };
}

async function processAbout(cache: Cache): Promise<AboutContent> {
  const fallback: AboutContent = {
    title: "About",
    bio: "",
    contactEmail: "",
    contactLinks: [],
    photo: null,
  };

  if (!(await pathExists(ABOUT_DIR))) return fallback;

  const entries = await readdir(ABOUT_DIR, { withFileTypes: true });
  const metaFile = entries.find((e) => e.isFile() && e.name === "meta.md");
  if (!metaFile) return fallback;

  const raw = await readFile(path.join(ABOUT_DIR, "meta.md"), "utf-8");
  const { data: fm } = matter(raw);

  let photo: Photo | null = null;
  const photoFile = entries.find(
    (e) => e.isFile() && IMAGE_EXT.test(e.name) && e.name !== "meta.md"
  );
  if (photoFile) {
    const outDir = path.join(MEDIA_DIR, "about");
    photo = await processImage({
      sourcePath: path.join(ABOUT_DIR, photoFile.name),
      outDir,
      outPublicPrefix: "/media/about",
      id: "portrait",
      alt: fm.title ?? "Portrait",
      cache,
      cacheKey: `about/${photoFile.name}`,
    });
  }

  return {
    title: fm.title ?? "About",
    bio: fm.bio ?? "",
    contactEmail: fm.contactEmail ?? "",
    contactLinks: Array.isArray(fm.contactLinks) ? fm.contactLinks : [],
    photo,
  };
}

// ---------------------------------------------------------------------------
// Cleanup: remove derivatives for categories/photos that no longer exist.
// ---------------------------------------------------------------------------

async function cleanupOrphans(currentSlugs: Set<string>) {
  if (!(await pathExists(MEDIA_DIR))) return;
  const dirs = await readdir(MEDIA_DIR, { withFileTypes: true });
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    if (d.name === "about") continue;
    if (!currentSlugs.has(d.name)) {
      console.log(`  · removing orphaned media/${d.name}`);
      await rm(path.join(MEDIA_DIR, d.name), { recursive: true, force: true });
    }
  }
}

function pruneCache(cache: Cache, liveKeys: Set<string>): Cache {
  const pruned: Cache = {};
  for (const key of Object.keys(cache)) {
    if (liveKeys.has(key)) pruned[key] = cache[key];
  }
  return pruned;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Ingesting photo categories…");
  await mkdir(CATEGORIES_DIR, { recursive: true });
  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });

  const cache = await loadCache();
  const published = await loadPublishedCategories();
  const liveKeys = new Set<string>();
  const origCacheKeyCount = Object.keys(cache).length;

  const folders = (await readdir(CATEGORIES_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(naturalSort);

  const categories: Category[] = [];
  for (const folder of folders) {
    const category = await processCategory(folder, cache, published);
    if (category) categories.push(category);

    // Cache keys are "slug/filename" (see processImage's cacheKey), so
    // record every current image filename to prune stale cache entries
    // for photos that have since been deleted from the folder.
    const dir = path.join(CATEGORIES_DIR, folder);
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    let sources = 0;
    for (const e of entries) {
      if (e.isFile() && (IMAGE_EXT.test(e.name) || VIDEO_EXT.test(e.name))) {
        liveKeys.add(`${slugify(folder)}/${e.name}`);
        sources++;
      }
    }

    // A category carried over from the manifest (see withoutSources) has no
    // filenames to record, and pruning on that would throw away work that is
    // still good: the originals are elsewhere, not gone, and the whole
    // archive would re-encode the moment they were plugged back in.
    if (sources === 0 && category) {
      const prefix = `${slugify(folder)}/`;
      for (const key of Object.keys(cache)) {
        if (key.startsWith(prefix)) liveKeys.add(key);
      }
    }
  }

  const about = await processAbout(cache);
  if (about.photo) {
    const aboutEntries = (await pathExists(ABOUT_DIR))
      ? await readdir(ABOUT_DIR, { withFileTypes: true })
      : [];
    for (const e of aboutEntries) {
      if (e.isFile() && IMAGE_EXT.test(e.name)) liveKeys.add(`about/${e.name}`);
    }
  }

  categories.sort((a, b) => a.order - b.order || naturalSort(a.slug, b.slug));

  await cleanupOrphans(new Set(categories.map((c) => c.slug)));

  const finalCache = pruneCache(cache, liveKeys);
  await writeFile(CACHE_PATH, JSON.stringify(finalCache, null, 2));

  const manifest = {
    generatedAt: new Date().toISOString(),
    categories,
    about,
  };
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  const totalPhotos = categories.reduce((n, c) => n + c.photos.length, 0);
  const newlyCached = Object.keys(finalCache).length - origCacheKeyCount;
  console.log(
    `\nDone. ${categories.length} categories, ${totalPhotos} photos ` +
      `(${Math.max(newlyCached, 0)} newly processed, rest reused from cache).`
  );
  console.log(`→ ${path.relative(ROOT, MANIFEST_PATH)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
