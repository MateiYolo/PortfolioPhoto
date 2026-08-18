import manifest from "@/data/manifest.json";

/**
 * Typed accessors over the build-time manifest produced by
 * `npm run ingest` (scripts/ingest.ts). Nothing in `app/` or `components/`
 * should import `data/manifest.json` directly — go through here so the
 * shape only needs to change in one place.
 */

export interface PhotoSource {
  /** Paths are relative to /public (or NEXT_PUBLIC_MEDIA_BASE, see below). */
  w720: string;
  w1440: string;
  w2560: string;
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
}

export interface Category {
  slug: string;
  title: string;
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
 * moved to a bucket (Vercel Blob / R2) later without touching a component —
 * set NEXT_PUBLIC_MEDIA_BASE and re-run ingest against the bucket.
 */
const MEDIA_BASE = process.env.NEXT_PUBLIC_MEDIA_BASE ?? "";

function resolvePhoto(photo: Photo): Photo {
  if (!MEDIA_BASE) return photo;
  return {
    ...photo,
    src: {
      w720: MEDIA_BASE + photo.src.w720,
      w1440: MEDIA_BASE + photo.src.w1440,
      w2560: MEDIA_BASE + photo.src.w2560,
    },
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
