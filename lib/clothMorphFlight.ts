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
/** How long to let a found destination stop moving before flying at it. */
const SETTLE_TIMEOUT_MS = 300;
/** ...and don't hold the last frame forever waiting on a photo that won't decode. */
const PAINT_TIMEOUT_MS = 1500;

/**
 * Symmetric easing, not the outExpo the native morph uses. The wave peaks at
 * the middle of the flight, and a front-loaded curve would have the photo
 * nearly parked by the time it is moving most — which reads as a glitch on a
 * stationary image rather than as fabric crossing the screen.
 */
const geometry = cubicBezier(...ease.inOutQuart);

const FULL_FRAME: Crop = { ox: 0, oy: 0, sx: 1, sy: 1 };

export interface BeginArgs {
  /** Photo.tsx's aspect box — the visible rectangle, transforms included. */
  frame: HTMLElement;
  /** The decoded <img> inside it, used directly as the texture. */
  img: HTMLImageElement;
  /** Selector for the destination photo's wrapper on the arriving page. */
  target: string;
  /** Pathname this flight is heading for — see the popstate guard below. */
  destination: string;
  /** Colour the source is showing right now, and the colour to land on. */
  saturationFrom: number;
  saturationTo: number;
  /**
   * Sweep the wave the other way. Going home is the same flight played
   * backwards, and a flag that flew left-to-right on the way out should not
   * fly left-to-right on the way back too.
   */
  reverse?: boolean;
}

let cancel: (() => void) | null = null;

/**
 * The visible slice of the photo, as a UV window.
 *
 * Nothing transforms the <img> inside its frame today — the homepage grid used
 * to drift it, and now answers the scroll with the swell instead — so this
 * comes out as the full frame every time. It stays because it is cheap and
 * because the alternative is a silent wrong crop: comparing the <img> box
 * against the overflow-clipped frame recovers whatever sub-rectangle is
 * actually on screen, so the day something does move the image inside its
 * frame again, the photo carries on showing the same pixels the moment WebGL
 * takes over instead of jumping to a different crop.
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

export function begin({
  frame,
  img,
  target,
  destination,
  saturationFrom,
  saturationTo,
  reverse = false,
}: BeginArgs): boolean {
  if (!engine.warm()) return false;
  const canvas = engine.canvas;
  if (!canvas) return false;
  // Nothing to sample from: let the native morph have it.
  if (!img.complete || img.naturalWidth === 0) return false;

  cancel?.();

  const from = measure(frame, img);
  if (from.rect.w < 1 || from.rect.h < 1) return false;

  /**
   * What the shader is told the flight has reached. Reversed for the way home,
   * which flips the direction the wave sweeps; the sin() envelope is symmetric
   * so it is zero at both ends either way.
   */
  const shaderProgress = (t: number) => (reverse ? 1 - t : t);

  const root = document.documentElement;
  const startedAt = performance.now();
  let raf = 0;
  let stopAnimation: (() => void) | null = null;
  let dead = false;

  /**
   * The destination has to be invisible from the frame it first paints in,
   * not a frame later, or it shows up under a quad still on its way to it —
   * so this is a rule, installed before the navigation, and not a ref and an
   * effect. It is written here rather than kept in globals.css because only
   * this code knows *which* photo is being flown to: on the way home the
   * grid is full of candidates and hiding all of them would be a blackout.
   */
  const hide = document.createElement("style");
  hide.textContent = `${target}{visibility:hidden}`;

  /** Idempotent: a stale popstate must never tear down a newer flight. */
  const end = (restoreSource: boolean) => {
    if (dead) return;
    dead = true;
    if (raf) cancelAnimationFrame(raf);
    stopAnimation?.();
    window.removeEventListener("popstate", onPopState);
    hide.remove();
    root.classList.remove(GATE);
    if (restoreSource) frame.style.visibility = "";
    engine.release();
    if (cancel === teardown) cancel = null;
  };
  const teardown = () => end(true);
  /**
   * A history move that isn't the one this flight is riding has to kill it —
   * the source is gone and the destination is never coming. The flight home
   * *is* started by a history move, though (the back button, caught on the
   * navigate event before the DOM swaps), so "any popstate" would abort the
   * very navigation it was launched for. Where we ended up is the honest test.
   */
  const onPopState = () => {
    if (location.pathname !== destination) end(true);
  };
  cancel = teardown;

  try {
    engine.setTexture(img);
    document.body.appendChild(canvas);
    // Drawn synchronously, before the click handler returns: this and the
    // visibility change below land in the same paint, so there is no frame in
    // which the photo is either doubled or missing.
    engine.draw(from.rect, from.crop, shaderProgress(0), 0, saturationFrom);
  } catch {
    end(true);
    return false;
  }

  frame.style.visibility = "hidden";
  document.head.append(hide);
  // Suppresses the native photo morph for exactly this navigation. The title
  // morph is untouched and still runs. See globals.css.
  root.classList.add(GATE);

  let settling: { el: HTMLElement; rect: Rect; since: number } | null = null;

  /**
   * The destination has to have stopped moving before it is worth aiming at.
   * Arriving home the page is scrolled to the tile and the grid's parallax
   * resolves against the new scroll position, so the first frame or two after
   * mount report a rect the photo is not going to end up in. Waiting for two
   * agreeing frames costs nothing and removes a whole class of near-miss —
   * with a timeout, because "never settles" must not mean "never lands".
   */
  const findTarget = (): HTMLElement | null => {
    const el = document.querySelector<HTMLElement>(target);
    if (!el) {
      settling = null;
      return null;
    }
    const { rect } = measure(el, null);
    // A mounted-but-unlaid-out element measures zero; landing on that would
    // fling the photo into the corner.
    if (rect.w < 1 || rect.h < 1) {
      settling = null;
      return null;
    }
    const now = performance.now();
    if (!settling || settling.el !== el) {
      settling = { el, rect, since: now };
      return null;
    }
    const still =
      Math.abs(rect.x - settling.rect.x) < 0.5 &&
      Math.abs(rect.y - settling.rect.y) < 0.5 &&
      Math.abs(rect.w - settling.rect.w) < 0.5 &&
      Math.abs(rect.h - settling.rect.h) < 0.5;
    settling.rect = rect;
    return still || now - settling.since > SETTLE_TIMEOUT_MS ? el : null;
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
        engine.draw(now.rect, now.crop, shaderProgress(1), DURATION_MS / 1000, saturationTo);
        handOff(targetEl, targetImg);
      });
      return;
    }
    root.classList.remove(GATE);
    hide.remove();
    raf = requestAnimationFrame(() => end(false));
  };

  const fly = (targetEl: HTMLElement) => {
    const targetImg = targetEl.querySelector("img");
    let upgraded = false;

    const controls = animate(0, 1, {
      duration: DURATION_MS / 1000 / speed(),
      ease: "linear",
      onUpdate: (t) => {
        if (!engine.alive) {
          end(true);
          return;
        }
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
          shaderProgress(t),
          (t * DURATION_MS) / 1000,
          mix(saturationFrom, saturationTo, eased)
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
        engine.draw(to.rect, to.crop, shaderProgress(1), DURATION_MS / 1000, saturationTo);
        handOff(targetEl, targetImg);
      },
    });
    stopAnimation = () => controls.stop();
  };

  const wait = () => {
    if (dead) return;
    if (!engine.alive) {
      end(true);
      return;
    }
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
    engine.draw(from.rect, from.crop, shaderProgress(0), 0, saturationFrom);
    raf = requestAnimationFrame(wait);
  };

  raf = requestAnimationFrame(wait);

  // Leaving mid-flight for anywhere else: the source element is gone and the
  // destination never arrives, so the quad would otherwise hang in the air.
  window.addEventListener("popstate", onPopState);

  return true;
}
