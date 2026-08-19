/**
 * The WebGL flag morph on the photo that travels between the homepage grid and
 * a category's lead shot — out and back. The effect is a shader
 * (lib/clothMorphGl.ts) and the choreography is a FLIP
 * (lib/clothMorphFlight.ts); this file is only the gate that decides whether
 * any of that is allowed to happen, and the reason neither of those two ends
 * up in the bundle of a page that will never run it.
 *
 * The native React <ViewTransition share="morph"> stays wired up in the markup
 * exactly as before. It is what runs whenever this bails: reduced motion, no
 * WebGL2, a photo that hasn't decoded, or a source that is scrolled out of
 * sight. Suppression is a single class on <html> that only exists while a
 * WebGL flight is live, so the fallback is the default rather than something
 * we have to remember to restore.
 */

/**
 * Minimal shape of the Navigation API, hand-declared so this does not depend
 * on which TypeScript lib version happens to describe it. See onNavigate.
 */
interface NavigateEvent extends Event {
  readonly navigationType: string;
  readonly destination: { readonly url: string };
}
interface NavigationApi {
  addEventListener(type: "navigate", listener: (event: NavigateEvent) => void): void;
  removeEventListener(type: "navigate", listener: (event: NavigateEvent) => void): void;
}
const navigation = (): NavigationApi | undefined =>
  (window as unknown as { navigation?: NavigationApi }).navigation;

type Flight = typeof import("@/lib/clothMorphFlight");

let flight: Flight | null = null;
let loading: Promise<void> | null = null;
/** Set once the browser has told us it can't do this, so we stop asking. */
let unsupported = false;

/**
 * Where the arriving page should be scrolled so the photo has something to
 * land on. Consumed once, by RouteScrollReset. See clothMorphLanding below.
 */
let landing: string | null = null;

/** Names come from category slugs, but they end up inside a CSS selector. */
const SAFE_NAME = /^[\w-]+$/;

/**
 * Pull in the shader and compile it ahead of the click, so the first frame
 * costs a draw call rather than a module fetch plus a link step. Called
 * directly on pointer enter, where the click is only a moment away; pages
 * that are merely *likely* to need it use the idle version below.
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
 * The same, but never in front of the photographs. A page that *might* need
 * the effect later has no business fetching a shader while the images it
 * exists to show are still on the wire. Returns its own teardown.
 */
export function prewarmClothMorphWhenIdle(): () => void {
  if (typeof window === "undefined") return () => {};
  if (!window.requestIdleCallback) {
    const timer = window.setTimeout(prewarmClothMorph, 1200);
    return () => window.clearTimeout(timer);
  }
  const id = window.requestIdleCallback(() => prewarmClothMorph());
  return () => window.cancelIdleCallback(id);
}

/**
 * Returns false — and touches nothing — if the WebGL morph can't run, which is
 * the caller's cue to do nothing at all and let the native transition play.
 */
function begin(args: Parameters<Flight["begin"]>[0]): boolean {
  landing = null;
  return flight?.begin(args) ?? false;
}

/**
 * How grey a photo is *right now*. The grid's hover ramp between grayscale and
 * colour is a 600ms CSS transition, so a tile clicked promptly is caught
 * part-way through it; reading the computed value hands the shader the exact
 * point to carry on from instead of guessing an end state.
 */
function readSaturation(el: HTMLElement): number {
  const filter = getComputedStyle(el).filter;
  const match = /grayscale\(([\d.]+)\)/.exec(filter);
  return match ? 1 - Math.min(1, Number(match[1])) : 1;
}

function photoParts(root: HTMLElement | null) {
  // Photo renders <div frame><img/></div>. The frame is the overflow-clipped
  // box the photo is actually seen through; the <img> inside it carries the
  // grid's parallax transform. The morph needs both, and neither is worth a
  // prop on Photo that only this file would ever pass.
  const img = root?.querySelector("img");
  const frame = img?.parentElement;
  return img && frame ? { img, frame } : null;
}

/**
 * Homepage tile -> category lead photo.
 *
 * Takes the slug, where watchClothMorphHome below takes the morph name: each
 * is handed what its caller already holds. The grid knows the category; the
 * photo sequence only ever knows the name it was given.
 */
export function clothMorphToCategory(slug: string, tile: HTMLElement | null): boolean {
  if (!SAFE_NAME.test(slug)) return false;
  const parts = photoParts(tile);
  if (!parts) return false;
  return begin({
    ...parts,
    target: `[data-cloth-target="photo-${slug}"]`,
    destination: `/work/${slug}`,
    saturationFrom: readSaturation(parts.frame),
    // The category page has no filter on its photos.
    saturationTo: 1,
  });
}

/**
 * The way back: any link home from a category page, plus the browser's own
 * back button. Both have to be caught before the DOM swaps, because the whole
 * effect starts by photographing an element that is about to stop existing.
 *
 * Returns its own teardown, for the effect that installs it.
 */
export function watchClothMorphHome(name: string): () => void {
  if (typeof window === "undefined" || !SAFE_NAME.test(name)) return () => {};
  const stopPrewarm = prewarmClothMorphWhenIdle();

  const start = () => {
    const parts = photoParts(document.querySelector(`[data-cloth-target="${name}"]`));
    if (!parts) return;

    // Morph what the user can actually see. The "Index" link sits in the
    // footer, several screens below the lead photo, and a photograph sailing
    // in from outside the viewport is an entrance, not a morph — better to
    // let those navigations arrive plainly.
    const r = parts.frame.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= window.innerHeight) return;

    const target = `[data-cloth-tile="${name}"]`;
    const flying = begin({
      ...parts,
      target,
      destination: "/",
      saturationFrom: readSaturation(parts.frame),
      // The grid is grey until it is hovered, and the pointer will not be on
      // the tile when the page lands.
      saturationTo: 0,
      reverse: true,
    });
    if (flying) landing = target;
  };

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.("a");
    if (!link || link.target === "_blank") return;
    if (new URL(link.href, location.href).pathname !== "/") return;
    start();
  };

  /**
   * The back button, which no click handler can see. popstate is too late —
   * Next commits the new page before those listeners run, so by then the lead
   * photo is already off the DOM and there is nothing to photograph. The
   * Navigation API's `navigate` fires *before* the swap, which is the only
   * hook early enough. Browsers without it (Firefox today) simply get the
   * native morph on back, the same as every other path that bails here.
   */
  const onNavigate = (event: NavigateEvent) => {
    if (event.navigationType !== "traverse") return;
    // Links are the click handler's job, and Next fires a second, synthetic
    // navigate once it has already moved: by then we are home and there is
    // nothing to fly.
    if (location.pathname === "/") return;
    if (new URL(event.destination.url).pathname !== "/") return;
    start();
  };

  // Capture, so this runs before next/link's own handler starts navigating.
  document.addEventListener("click", onClick, true);
  navigation()?.addEventListener("navigate", onNavigate);
  return () => {
    stopPrewarm();
    document.removeEventListener("click", onClick, true);
    navigation()?.removeEventListener("navigate", onNavigate);
  };
}

/**
 * Where RouteScrollReset should put the arriving page, or null for its usual
 * top-of-page.
 *
 * Only a return home ever asks for anything else, and it has to: at scroll 0
 * the grid's first tile is barely on screen and the sixth is five screens
 * down, so a morph "back to the tile" would be a photo thrown off the bottom
 * of the window. Landing on the tile is also simply where the visitor was.
 *
 * Consumed on read, so a request can only ever apply to the navigation that
 * made it.
 */
export function clothMorphLanding(): number | null {
  const selector = landing;
  landing = null;
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  const view = window.innerHeight;
  const top = rect.top + window.scrollY;
  // Centred, unless the photo is taller than the window — then just under the
  // fixed nav, so the top of it is what you see.
  const wanted = rect.height >= view - 96 ? top - 48 : top - (view - rect.height) / 2;
  const max = Math.max(0, document.documentElement.scrollHeight - view);
  return Math.min(Math.max(wanted, 0), max);
}
