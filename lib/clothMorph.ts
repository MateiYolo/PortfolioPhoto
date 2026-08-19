/**
 * Homepage tile -> category lead photo, with the photo itself billowing like
 * cloth while it is in the air. The effect is WebGL (lib/clothMorphGl.ts) and
 * the choreography is a FLIP (lib/clothMorphFlight.ts); this file is only the
 * gate that decides whether any of that is allowed to happen, and the reason
 * neither of those two ends up in the bundle of a page that will never run it.
 *
 * The native React <ViewTransition share="morph"> stays wired up in the markup
 * exactly as before. It is what runs whenever this bails: reduced motion, no
 * WebGL2, a photo that hasn't decoded, or the reverse navigation. Suppression
 * is a single class on <html> that only exists while a WebGL flight is live,
 * so the fallback is the default rather than something we have to remember to
 * restore.
 *
 * Reverse navigation (category -> home, "← Index", browser back) deliberately
 * keeps the native morph. The forward case can measure its source rect inside
 * the click that starts it; going back, the destination tile's position is not
 * known until RouteScrollReset has moved Lenis to the top and the grid has
 * laid out, and holding a quad in the air across that is exactly where a seam
 * would come from.
 */

type Flight = typeof import("@/lib/clothMorphFlight");

let flight: Flight | null = null;
let loading: Promise<void> | null = null;
/** Set once the browser has told us it can't do this, so we stop asking. */
let unsupported = false;

/**
 * Pull in the shader and compile it ahead of the click. Called on idle from
 * the grid and again on pointer enter, so by the time a tile is clicked the
 * first frame costs a draw call rather than a module fetch plus a link step.
 */
export function prewarmClothMorph(): void {
  if (unsupported || flight || loading) return;
  if (typeof window === "undefined" || !("WebGL2RenderingContext" in window)) {
    unsupported = true;
    return;
  }
  loading = import("@/lib/clothMorphFlight")
    .then((mod) => {
      if (!mod.warm()) {
        unsupported = true;
        return;
      }
      flight = mod;
    })
    .catch(() => {
      unsupported = true;
    })
    .finally(() => {
      loading = null;
    });
}

/**
 * Returns false — and touches nothing — if the WebGL morph can't run, which is
 * the caller's cue to do nothing at all and let the native transition play.
 */
export function beginClothMorph(args: {
  frame: HTMLElement;
  img: HTMLImageElement;
  target: string;
  saturation: number;
}): boolean {
  return flight?.begin(args) ?? false;
}

/**
 * How grey the tile is *right now*. The hover ramp between grayscale and
 * colour is a 600ms CSS transition, so a tile clicked promptly is caught
 * part-way through it; reading the computed value hands the shader the exact
 * point to carry on from instead of guessing an end state.
 */
export function readSaturation(el: HTMLElement): number {
  const filter = getComputedStyle(el).filter;
  const match = /grayscale\(([\d.]+)\)/.exec(filter);
  return match ? 1 - Math.min(1, Number(match[1])) : 1;
}
