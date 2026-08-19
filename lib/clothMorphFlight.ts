import { animate, cubicBezier } from "motion/react";
import { DURATION_MS, engine, type Crop, type Rect } from "@/lib/clothMorphGl";
import { ease } from "@/lib/motion";

/**
 * The choreography around the shader: a FLIP between two DOM rects, with a
 * WebGL quad standing in for the photo while it is in the air.
 *
 * Everything here is imperative and lives outside React on purpose. The quad
 * has to be drawn in the same task as the click that hides the thumbnail —
 * one frame of both-or-neither is the whole difference between a hand-off you
 * cannot see and a flicker — and React cannot promise that ordering across a
 * navigation that is itself unmounting the source element.
 */

/** Set on <html> for the length of the flight; see globals.css for what it gates. */
const GATE = "cloth-morph";

/** Give up and let the page arrive plainly if the destination never shows. */
const FIND_TIMEOUT_MS = 2500;
/** ...and don't hold the last frame forever waiting on a photo that won't decode. */
const PAINT_TIMEOUT_MS = 1500;

/**
 * Symmetric easing, not the outExpo the native morph uses. The billow peaks at
 * the middle of the flight, and a front-loaded curve would have the photo
 * nearly parked by the time it is at its most distorted — which reads as a
 * glitch on a stationary image rather than as fabric moving through the air.
 */
const geometry = cubicBezier(...ease.inOutQuart);

const FULL_FRAME: Crop = { ox: 0, oy: 0, sx: 1, sy: 1 };

export interface BeginArgs {
  /** Photo.tsx's aspect box — the visible rectangle, transforms included. */
  frame: HTMLElement;
  /** The decoded <img> inside it, used directly as the texture. */
  img: HTMLImageElement;
  /** Selector for the destination photo's wrapper on the category page. */
  target: string;
  /** The tile's live grayscale amount, so the shader can finish the ramp. */
  saturation: number;
}

let cancel: (() => void) | null = null;

/**
 * The visible slice of the photo, as a UV window.
 *
 * The homepage drifts the <img> inside its own frame (imgY/imgScale in
 * CategoryTile), so the thumbnail shows a moving sub-rectangle of the photo,
 * not the whole thing. Comparing the transformed <img> box against the
 * overflow-clipped frame recovers exactly which sub-rectangle that is —
 * without it the photo would jump to a different crop the moment WebGL took
 * over. This relies on the <img> box showing the whole photo, which holds
 * because Photo.tsx gives the frame the photo's own aspect ratio; the shader's
 * cover-fit is the backstop if that ever stops being true.
 */
function measure(frame: HTMLElement, img: HTMLImageElement | null): {
  rect: Rect;
  crop: Crop;
} {
  const f = frame.getBoundingClientRect();
  const rect = { x: f.left, y: f.top, w: f.width, h: f.height };
  const i = img?.getBoundingClientRect();
  if (!i || !i.width || !i.height) return { rect, crop: FULL_FRAME };
  return {
    rect,
    crop: {
      ox: (f.left - i.left) / i.width,
      oy: (f.top - i.top) / i.height,
      sx: f.width / i.width,
      sy: f.height / i.height,
    },
  };
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const mixRect = (a: Rect, b: Rect, t: number): Rect => ({
  x: mix(a.x, b.x, t),
  y: mix(a.y, b.y, t),
  w: mix(a.w, b.w, t),
  h: mix(a.h, b.h, t),
});

const mixCrop = (a: Crop, b: Crop, t: number): Crop => ({
  ox: mix(a.ox, b.ox, t),
  oy: mix(a.oy, b.oy, t),
  sx: mix(a.sx, b.sx, t),
  sy: mix(a.sy, b.sy, t),
});

/** Debug hatch for the Playwright capture; 0.1 runs the flight 10x slower. */
function speed(): number {
  const s = (window as { __clothMorphSpeed?: number }).__clothMorphSpeed;
  return typeof s === "number" && s > 0 ? s : 1;
}

export function warm(): boolean {
  return engine.warm();
}

export function abort() {
  cancel?.();
}

export function begin({ frame, img, target, saturation }: BeginArgs): boolean {
  if (!engine.warm()) return false;
  const canvas = engine.canvas;
  if (!canvas) return false;
  // Nothing to sample from: let the native morph have it.
  if (!img.complete || img.naturalWidth === 0) return false;

  cancel?.();

  const from = measure(frame, img);
  if (from.rect.w < 1 || from.rect.h < 1) return false;

  const root = document.documentElement;
  const startedAt = performance.now();
  let raf = 0;
  let stopAnimation: (() => void) | null = null;
  let dead = false;

  /** Idempotent: a stale popstate must never tear down a newer flight. */
  const end = (restoreSource: boolean) => {
    if (dead) return;
    dead = true;
    if (raf) cancelAnimationFrame(raf);
    stopAnimation?.();
    window.removeEventListener("popstate", onPopState);
    root.classList.remove(GATE);
    if (restoreSource) frame.style.visibility = "";
    engine.release();
    if (cancel === teardown) cancel = null;
  };
  const teardown = () => end(true);
  const onPopState = () => end(true);
  cancel = teardown;

  try {
    engine.setTexture(img);
    document.body.appendChild(canvas);
    // Drawn synchronously, before the click handler returns: this and the
    // visibility change below land in the same paint, so there is no frame in
    // which the photo is either doubled or missing.
    engine.draw(from.rect, from.crop, 0, 0, saturation);
  } catch {
    end(true);
    return false;
  }

  frame.style.visibility = "hidden";
  // Suppresses the native photo morph for exactly this navigation. The title
  // morph is untouched and still runs. See globals.css.
  root.classList.add(GATE);

  const findTarget = (): HTMLElement | null => {
    const el = document.querySelector<HTMLElement>(target);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // A mounted-but-unlaid-out element measures zero; landing on that would
    // fling the photo into the corner.
    return rect.width > 1 && rect.height > 1 ? el : null;
  };

  /**
   * Reveal, then retire — in that order and a frame apart. The DOM photo is
   * uncovered while the final WebGL frame is still painted opaquely over it,
   * so the canvas leaves over an image that is already there. The other order
   * shows one frame of empty page.
   *
   * Photo.tsx's `instant` prop is what keeps this a single reveal: the lead
   * photo already sits at full opacity behind the canvas, so nothing fades in
   * on top of a morph that has only just finished.
   */
  const handOff = (targetEl: HTMLElement, targetImg: HTMLImageElement | null) => {
    if (dead) return;
    const paintable = !targetImg || (targetImg.complete && targetImg.naturalWidth > 0);
    if (!paintable && performance.now() - startedAt < PAINT_TIMEOUT_MS) {
      // Hold the last frame rather than uncover a photo with nothing to show
      // yet. Keep redrawing so a scroll during the wait still tracks.
      raf = requestAnimationFrame(() => {
        const now = measure(targetEl, targetImg);
        engine.draw(now.rect, now.crop, 1, DURATION_MS / 1000, 1);
        handOff(targetEl, targetImg);
      });
      return;
    }
    root.classList.remove(GATE);
    raf = requestAnimationFrame(() => end(false));
  };

  const fly = (targetEl: HTMLElement) => {
    const targetImg = targetEl.querySelector("img");
    let upgraded = false;

    const controls = animate(0, 1, {
      duration: DURATION_MS / 1000 / speed(),
      ease: "linear",
      onUpdate: (t) => {
        // The destination page is a live, scrollable document under the canvas
        // (React cancels the root snapshot, so nothing is frozen) and Lenis may
        // still be settling it. Re-reading the target every frame is one
        // getBoundingClientRect and keeps the quad glued to where the photo
        // will actually be.
        const to = measure(targetEl, targetImg);
        const eased = geometry(t);
        engine.draw(
          mixRect(from.rect, to.rect, eased),
          mixCrop(from.crop, to.crop, eased),
          // Linear in time, so the shader's sin() envelope peaks at the middle
          // of the flight rather than wherever the easing happens to put it.
          t,
          (t * DURATION_MS) / 1000,
          mix(saturation, 1, eased)
        );

        // The lead photo is a larger derivative of the same file and is being
        // fetched anyway. Swapping it in mid-flight costs no request, is
        // invisible (same picture), and is what makes the last frame as sharp
        // as the DOM image it dissolves into.
        if (!upgraded && targetImg?.complete && engine.wouldUpgrade(targetImg)) {
          upgraded = true;
          engine.setTexture(targetImg);
        }
      },
      onComplete: () => {
        if (dead) return;
        const to = measure(targetEl, targetImg);
        engine.draw(to.rect, to.crop, 1, DURATION_MS / 1000, 1);
        handOff(targetEl, targetImg);
      },
    });
    stopAnimation = () => controls.stop();
  };

  const wait = () => {
    if (dead) return;
    const el = findTarget();
    if (el) {
      fly(el);
      return;
    }
    if (performance.now() - startedAt > FIND_TIMEOUT_MS) {
      end(true);
      return;
    }
    // Until the destination exists the quad holds over where the thumbnail
    // was, which is what the native morph does while it waits for the commit.
    // Redrawn each frame so a resize keeps it in place.
    engine.draw(from.rect, from.crop, 0, 0, saturation);
    raf = requestAnimationFrame(wait);
  };

  raf = requestAnimationFrame(wait);

  // Browser back mid-flight: the source element is gone and the destination
  // never arrives, so the quad would otherwise hang in the air.
  window.addEventListener("popstate", onPopState);

  return true;
}
