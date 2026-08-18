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
 * Idempotent: each source file's content hash is cached in
 * data/.ingest-cache.json. Re-running after adding one photo to an
 * existing category only processes that one photo.
 */

import { createHash } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

type PhotoSource = Record<`w${(typeof WIDTHS)[number]}`, string>;

interface Photo {
  id: string;
  src: PhotoSource;
  width: number;
  height: number;
  orientation: "landscape" | "portrait" | "square";
  lqip: string;
  luminance: number;
  alt: string;
}

interface Category {
  slug: string;
  title: string;
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

async function hashFile(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return createHash("sha1")
    .update(PIPELINE_VERSION)
    .update(WIDTHS.join(","))
    .update(JSON.stringify(AVIF_OPTIONS))
    .update(buf)
    .digest("hex");
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

async function processImage(opts: {
  sourcePath: string;
  outDir: string;
  outPublicPrefix: string; // e.g. /media/tokyo-nights
  id: string;
  alt: string;
  cache: Cache;
  cacheKey: string;
}): Promise<Photo> {
  const { sourcePath, outDir, outPublicPrefix, id, alt, cache, cacheKey } = opts;

  const hash = await hashFile(sourcePath);
  const cached = cache[cacheKey];

  // Check the paths the cached entry actually recorded, not the nominal
  // widths. Derivatives are named for their *clamped* width, so a 1358px
  // original never produces an `id-2560.avif` — probing for one would
  // declare the cache stale on every run and re-encode the whole archive.
  const derivativesExist =
    cached?.hash === hash &&
    (await Promise.all(
      [...new Set(Object.values(cached.photo.src))].map((publicPath) =>
        pathExists(path.join(ROOT, "public", publicPath))
      )
    ).then((results) => results.every(Boolean)));

  if (cached?.hash === hash && derivativesExist) {
    return cached.photo;
  }

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

  const photo: Photo = {
    id,
    src: src as PhotoSource,
    width: fullWidth,
    height: fullHeight,
    orientation,
    lqip,
    luminance: Math.round(luminance * 1000) / 1000,
    alt,
  };

  cache[cacheKey] = { hash, photo };
  return photo;
}

// ---------------------------------------------------------------------------
// Category + about processing
// ---------------------------------------------------------------------------

async function processCategory(
  folderName: string,
  cache: Cache
): Promise<Category | null> {
  const dir = path.join(CATEGORIES_DIR, folderName);
  const entries = await readdir(dir, { withFileTypes: true });
  const metaFile = entries.find((e) => e.isFile() && e.name === "meta.md");
  if (!metaFile) {
    console.warn(`  ! skipping "${folderName}" — no meta.md found`);
    return null;
  }

  const raw = await readFile(path.join(dir, "meta.md"), "utf-8");
  const { data: fm } = matter(raw);
  const slug = slugify(fm.slug ?? folderName);

  const imageFiles = entries
    .filter((e) => e.isFile() && IMAGE_EXT.test(e.name))
    .map((e) => e.name)
    .sort(naturalSort);

  if (imageFiles.length === 0) {
    console.warn(`  ! skipping "${folderName}" — no images found`);
    return null;
  }
  if (imageFiles.length > 15) {
    console.warn(
      `  ! "${folderName}" has ${imageFiles.length} photos — plan calls for 5-15, trimming to first 15`
    );
  }
  const selected = imageFiles.slice(0, 15);

  const outDir = path.join(MEDIA_DIR, slug);
  const outPublicPrefix = `/media/${slug}`;

  console.log(`  · ${slug} (${selected.length} photos)`);

  const photos: Photo[] = [];
  for (const filename of selected) {
    const id = slugify(path.basename(filename, path.extname(filename)));
    const photo = await processImage({
      sourcePath: path.join(dir, filename),
      outDir,
      outPublicPrefix,
      id,
      alt: humanizeFilename(filename) || fm.title || slug,
      cache,
      cacheKey: `${slug}/${filename}`,
    });
    photos.push(photo);
  }

  const coverPhoto =
    photos.find((p) => p.id === slugify(fm.cover ?? "")) ?? photos[0];

  return {
    slug,
    title: fm.title ?? folderName,
    date: formatDate(fm.date),
    blurb: fm.blurb ?? "",
    order: typeof fm.order === "number" ? fm.order : 999,
    cover: coverPhoto,
    photos,
  };
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
  const liveKeys = new Set<string>();
  const origCacheKeyCount = Object.keys(cache).length;

  const folders = (await readdir(CATEGORIES_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(naturalSort);

  const categories: Category[] = [];
  for (const folder of folders) {
    const category = await processCategory(folder, cache);
    if (category) categories.push(category);

    // Cache keys are "slug/filename" (see processImage's cacheKey), so
    // record every current image filename to prune stale cache entries
    // for photos that have since been deleted from the folder.
    const dir = path.join(CATEGORIES_DIR, folder);
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.isFile() && IMAGE_EXT.test(e.name)) {
        liveKeys.add(`${slugify(folder)}/${e.name}`);
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
