import type { Photo } from "@/lib/content";

/**
 * Tile geometry, declared once, in numbers.
 *
 * The layout width of a tile and the `sizes` attribute of the <img> inside
 * it have to describe the *same* box. When they drift, the browser picks a
 * srcset candidate for a box that doesn't exist: over-declare and it
 * downloads and decodes several times the pixels it will ever paint, which
 * is the single most expensive mistake available on an image-heavy page
 * (a 2560px AVIF costs ~85ms of decode where the 1440px one costs ~28ms).
 *
 * So neither string is written by hand — both are generated from one
 * {min, vw, max} triple, and a tile can only be resized by editing that.
 */
export interface TileWidth {
  /** Lower clamp bound, rem. */
  min: number;
  /** Preferred width, vw. */
  vw: number;
  /** Upper clamp bound, rem. */
  max: number;
  /**
   * Optional height ceiling, in svh. A photo is only ever sized by width,
   * so the way to stop a tall portrait running off a short laptop screen
   * is to cap that width by what the photo's own ratio allows in this much
   * viewport height. Uncropped either way.
   */
  capSvh?: number;
}

/** Below this, `.category-tile-frame` goes full-bleed (see globals.css). */
const MOBILE_MAX_PX = 767;

export function tileWidth(t: TileWidth, photo?: Photo): string {
  const base = `clamp(${t.min}rem, ${t.vw}vw, ${t.max}rem)`;
  if (!t.capSvh || !photo) return base;
  return `min(${base}, calc(${t.capSvh}svh * ${ratioOf(photo)}))`;
}

function ratioOf(photo: Photo): string {
  return (photo.width / photo.height).toFixed(4);
}

/**
 * The `sizes` counterpart of `tileWidth`. Three regimes, matching the
 * clamp exactly: full-bleed on mobile, pinned to `max` once the viewport is
 * wide enough for the clamp to cap out, and `vw` in between.
 *
 * The lower bound never appears: it only binds below ~27rem of viewport,
 * which is deep inside the mobile branch already.
 */
export function tileSizes(t: TileWidth, photo?: Photo): string {
  const capRem = Math.round((t.max / t.vw) * 10000) / 100;
  const regimes = [
    { at: `(max-width: ${MOBILE_MAX_PX}px)`, width: "100vw" },
    { at: `(min-width: ${capRem}rem)`, width: `${t.max}rem` },
    { at: "", width: `${t.vw}vw` },
  ];

  // A height-capped tile takes whichever bound is smaller, which is what
  // `min()` says directly. Note `vh` here against `svh` in the layout: the
  // two differ only while a mobile URL bar is mid-collapse, which is noise
  // for picking a srcset rung, and `svh` is the shakier of the two to rely
  // on inside a `sizes` attribute.
  const cap =
    t.capSvh && photo ? `${(t.capSvh * (photo.width / photo.height)).toFixed(2)}vh` : null;

  return regimes
    .map((r) => {
      const width = cap ? `min(${r.width}, ${cap})` : r.width;
      return r.at ? `${r.at} ${width}` : width;
    })
    .join(", ");
}

/** Homepage cover tiles — see components/CategoryGrid.tsx. */
export const GRID_TILE: Record<Photo["orientation"], TileWidth> = {
  landscape: { min: 20, vw: 62, max: 52 },
  portrait: { min: 16, vw: 36, max: 30 },
  square: { min: 18, vw: 48, max: 38 },
};

/** Category page photo sequence — see components/CategoryPhotoSequence.tsx. */
export const SEQUENCE_TILE: Record<Photo["orientation"], TileWidth> = {
  landscape: { min: 20, vw: 74, max: 58, capSvh: 88 },
  portrait: { min: 15, vw: 40, max: 28, capSvh: 88 },
  square: { min: 17, vw: 52, max: 36, capSvh: 88 },
};

/** The photo that opens a category carries the page, so it gets more room. */
export const SEQUENCE_LEAD_TILE: Record<Photo["orientation"], TileWidth> = {
  landscape: { min: 20, vw: 92, max: 72, capSvh: 78 },
  portrait: { min: 15, vw: 52, max: 34, capSvh: 78 },
  square: { min: 17, vw: 66, max: 46, capSvh: 78 },
};

/**
 * Build a srcset from whatever derivatives the manifest actually has, so
 * adding a width in scripts/ingest.ts needs no change here.
 *
 * Two things this has to get right:
 *
 *  - Descriptors are the *real* pixel width of the file, not the nominal
 *    slot. Ingest clamps to the source (nothing is upscaled), so a 1358px
 *    original lands in the w1440 *and* w2560 slots as the same 1358px file.
 *  - That collision must be emitted once. Listing one file twice under two
 *    different descriptors tells the browser a 1358px file is also 2560px
 *    wide, and it will happily pick it for a 2560px box and paint it soft.
 */
export function buildSrcSet(photo: Photo): string {
  const seen = new Set<string>();

  return Object.entries(photo.src)
    .map(([slot, path]) => ({ nominal: Number(slot.slice(1)), path }))
    .filter((e) => Number.isFinite(e.nominal) && e.nominal > 0 && Boolean(e.path))
    .sort((a, b) => a.nominal - b.nominal)
    .filter((e) => {
      if (seen.has(e.path)) return false;
      seen.add(e.path);
      return true;
    })
    .map((e) => `${e.path} ${Math.min(e.nominal, photo.width)}w`)
    .join(", ");
}

/** Largest derivative available — the `src` fallback and preload target. */
export function largestSrc(photo: Photo): string {
  const entries = Object.entries(photo.src)
    .map(([slot, path]) => ({ nominal: Number(slot.slice(1)), path }))
    .filter((e) => Number.isFinite(e.nominal) && Boolean(e.path))
    .sort((a, b) => b.nominal - a.nominal);
  return entries[0]?.path ?? "";
}
