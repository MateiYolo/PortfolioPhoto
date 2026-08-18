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
}

/** Below this, `.category-tile-frame` goes full-bleed (see globals.css). */
const MOBILE_MAX_PX = 767;

export function tileWidth(t: TileWidth): string {
  return `clamp(${t.min}rem, ${t.vw}vw, ${t.max}rem)`;
}

/**
 * The `sizes` counterpart of `tileWidth`. Three regimes, matching the
 * clamp exactly: full-bleed on mobile, pinned to `max` once the viewport is
 * wide enough for the clamp to cap out, and `vw` in between.
 *
 * The lower bound never appears: it only binds below ~27rem of viewport,
 * which is deep inside the mobile branch already.
 */
export function tileSizes(t: TileWidth): string {
  const capRem = Math.round((t.max / t.vw) * 10000) / 100;
  return [
    `(max-width: ${MOBILE_MAX_PX}px) 100vw`,
    `(min-width: ${capRem}rem) ${t.max}rem`,
    `${t.vw}vw`,
  ].join(", ");
}

/** Homepage cover tiles — see components/CategoryGrid.tsx. */
export const GRID_TILE: Record<Photo["orientation"], TileWidth> = {
  landscape: { min: 20, vw: 62, max: 52 },
  portrait: { min: 16, vw: 36, max: 30 },
  square: { min: 18, vw: 48, max: 38 },
};

/** Category page photo sequence — see components/CategoryPhotoSequence.tsx. */
export const SEQUENCE_TILE: Record<Photo["orientation"], TileWidth> = {
  landscape: { min: 20, vw: 74, max: 58 },
  portrait: { min: 15, vw: 40, max: 28 },
  square: { min: 17, vw: 52, max: 36 },
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
