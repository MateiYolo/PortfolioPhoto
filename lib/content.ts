import manifest from "@/data/manifest.json";

/**
 * Typed accessors over the build-time manifest produced by
 * `npm run ingest` (scripts/ingest.ts). Nothing in `app/` or `components/`
 * should import `data/manifest.json` directly. Go through here so the
 * shape only needs to change in one place.
 */

/**
 * Keyed by nominal derivative width — `w720`, `w1440`, … — whichever ones
 * scripts/ingest.ts was configured to emit. Deliberately open-ended rather
 * than a fixed triple: adding a width to the ingest pipeline should not
 * require a matching edit in every consumer, and every consumer already
 * reads it generically (see lib/imageSizes.ts).
 *
 * Paths are relative to /public (or NEXT_PUBLIC_MEDIA_BASE, see below).
 */
export type PhotoSource = Record<`w${number}`, string>;

/**
 * Where a clip's mp4 rungs live, keyed by nominal width the same way
 * PhotoSource is. Short, muted, and already looping: see the video section
 * of scripts/ingest.ts for what is baked into one of these.
 */
export type VideoSource = Record<`w${number}`, string>;

export interface VideoClip {
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

export interface Photo {
  id: string;
  src: PhotoSource;
  width: number;
  height: number;
  orientation: "landscape" | "portrait" | "square";
  /** Base64 data URI, ~20px wide, for instant blur-up. */
  lqip: string;
  /** 0 (black) .. 1 (white) average luminance, for overlay text contrast. */
  luminance: number;
  alt: string;
  /**
   * Present only on an item that came from a video file, in which case
   * every field above describes its poster frame. A consumer that ignores
   * this renders the still and is not wrong, only quiet.
   */
  video?: VideoClip;
}

export interface Category {
  slug: string;
  title: string;
  caption: string;
  date: string;
  blurb: string;
  order: number;
  cover: Photo;
  photos: Photo[];
}

export interface AboutContent {
  title: string;
  bio: string;
  contactEmail: string;
  contactLinks: { label: string; href: string }[];
  photo: Photo | null;
}

interface Manifest {
  generatedAt: string;
  categories: Category[];
  about: AboutContent;
}

const data = manifest as unknown as Manifest;

/**
 * Prefix every media path with this at read time so ingest output can be
 * moved to a bucket (Vercel Blob / R2) later without touching a component:
 * set NEXT_PUBLIC_MEDIA_BASE and re-run ingest against the bucket.
 */
const MEDIA_BASE = process.env.NEXT_PUBLIC_MEDIA_BASE ?? "";

function rebase<T extends PhotoSource | VideoSource>(src: T): T {
  return Object.fromEntries(
    Object.entries(src).map(([slot, path]) => [slot, MEDIA_BASE + path])
  ) as T;
}

function resolvePhoto(photo: Photo): Photo {
  if (!MEDIA_BASE) return photo;
  return {
    ...photo,
    src: rebase(photo.src),
    ...(photo.video
      ? { video: { ...photo.video, src: rebase(photo.video.src) } }
      : undefined),
  };
}

export function getCategories(): Category[] {
  return [...data.categories]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({
      ...c,
      cover: resolvePhoto(c.cover),
      photos: c.photos.map(resolvePhoto),
    }));
}

export function getCategory(slug: string): Category | undefined {
  return getCategories().find((c) => c.slug === slug);
}

export function getAdjacentCategory(slug: string): Category | undefined {
  const all = getCategories();
  const i = all.findIndex((c) => c.slug === slug);
  if (i === -1) return undefined;
  return all[(i + 1) % all.length];
}

export function getAbout(): AboutContent {
  if (!data.about.photo) return data.about;
  return { ...data.about, photo: resolvePhoto(data.about.photo) };
}
