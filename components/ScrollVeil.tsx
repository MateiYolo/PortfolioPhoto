"use client";

import { useLenis } from "lenis/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useScrollVelocityFactor } from "@/components/ScrollVelocity";
import { MORPH_END, MORPH_GATE, MORPH_START } from "@/lib/clothMorphSignal";
import type { VeilEngine, VeilQuad, VeilTexture } from "@/lib/scrollVeilGl";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * How deaf the veil is to a gentle scroll. Above 1, so the bottom of the
 * range is squashed: a drift at a tenth of full speed (260px/s — see
 * FULL_TILT_SPEED in components/ScrollVelocity.tsx) moves the fabric a
 * *thirtieth* of its travel, which on a 700px photo is a pixel and a half.
 * That is the whole feel of the thing: a slow reader should have to look for
 * the veil, and someone throwing the page should not be able to miss it.
 */
const AMP_CURVE = 1.5;
/** Extra veil on a photo still arriving, as a fraction, at full speed. */
const ENTRY_BOOST = 0.55;
/** Where in the viewport a photo counts as arrived, as a fraction of height. */
const ARRIVED_AT = 0.55;
/** Wave cycles the fabric travels per second of scrolling at full speed. */
const FLOW_RATE = 0.6;

/**
 * How far outside the viewport WebGL takes a photo over from the browser,
 * and how far out it gives it back and drops the texture. Both hand-offs
 * have to happen where nobody can see them, and they are far apart so that
 * a photo hovering on the boundary can't flutter between the two.
 *
 * 320px is seven frames of a flat-out fling, so the take-over is always
 * finished well before the photo is on screen.
 */
const DRAW_MARGIN = 320;
const KEEP_MARGIN_VH = 0.75;

/** Texture uploads allowed per frame; see the note in the frame loop. */
const UPLOADS_PER_FRAME = 1;
/** Frames with nothing moving before the loop parks itself. */
const IDLE_FRAMES = 3;
/** How long after a Lenis tick the plain rAF stays out of the way. */
const SCROLL_OWNS_MS = 48;

interface Entry {
  /** The wrapper <Veil> rendered; the photo is found underneath it. */
  el: HTMLElement;
  /** Photo.tsx's aspect box — the visible rectangle. */
  frame: HTMLElement | null;
  img: HTMLImageElement | null;
  texture: VeilTexture | null;
  /** The currentSrc the texture was uploaded from. */
  src: string;
  /** True while the DOM photo is hidden and the canvas is standing in. */
  drawn: boolean;
  /** True while waiting on a decode to tell us the photo can be uploaded. */
  waiting: boolean;
  /** Constant, so no two photos on screen wave in step. */
  phase: number;
}

interface VeilApi {
  /** True once WebGL has actually taken the photographs over. */
  active: boolean;
  register: (el: HTMLElement) => () => void;
}

const DORMANT: VeilApi = { active: false, register: () => () => {} };
const VeilContext = createContext<VeilApi>(DORMANT);

/**
 * Whether the veil is running. False on reduced motion, on anything without
 * WebGL2, and on the first render everywhere — callers are expected to have
 * a resting state that needs no canvas, and to keep the same elements
 * mounted when this flips, since remounting a photo throws away its decode.
 */
export function useVeilActive(): boolean {
  return useContext(VeilContext).active;
}

/**
 * The scroll veil (lib/scrollVeilGl.ts) hung over one page's photographs.
 *
 * While this is running the photographs inside it are painted by WebGL
 * rather than by the browser, and how hard the visitor is scrolling decides
 * how much the fabric moves: barely at a drift, fully at a fling, still when
 * still. The DOM photo underneath is only hidden — never unmounted — so
 * every hand-off is a visibility flip on an element that keeps its layout,
 * its click target and its place in the document.
 *
 * Three rules hold the illusion together, and none of them is optional:
 *
 * 1. A photo is taken over and handed back well outside the viewport
 *    (DRAW_MARGIN), so nobody ever sees the swap. Inside the viewport the
 *    canvas owns the photo whatever the scroll is doing, including nothing.
 * 2. The measure-and-draw happens *after* Lenis has moved the page, which
 *    is why the Lenis callback below exists rather than a plain rAF alone.
 *    Measuring before it would glue every veiled photo one frame behind the
 *    text beside it — the exact thing this effect must not do.
 * 3. When nothing has moved for a few frames the loop parks itself, and the
 *    canvas simply keeps its last frame. A category page at rest is one the
 *    GPU has stopped drawing.
 */
export function ScrollVeilProvider({ children }: { children: ReactNode }) {
  const speed = useScrollVelocityFactor();
  const reducedMotion = useReducedMotion();
  const [active, setActive] = useState(false);

  const entriesRef = useRef<Set<Entry> | null>(null);
  entriesRef.current ??= new Set();
  const engineRef = useRef<VeilEngine | null>(null);
  const wakeRef = useRef<(() => void) | null>(null);
  /** Set by the frame loop so the Lenis callback can reach into it. */
  const scrolledRef = useRef<((now: number) => void) | null>(null);

  const register = useCallback((el: HTMLElement) => {
    const entries = entriesRef.current!;
    const entry: Entry = {
      el,
      frame: null,
      img: null,
      texture: null,
      src: "",
      drawn: false,
      waiting: false,
      phase: Math.random() * Math.PI * 2,
    };
    entries.add(entry);
    // A photo appearing is not movement, and the loop parks itself when the
    // page is not moving: without this, photographs that mount into a page
    // already standing still would never be taken over at all.
    wakeRef.current?.();
    return () => {
      entries.delete(entry);
      // A photo that has left the page must not leave its stand-in painted
      // on the canvas, nor its DOM element hidden if it comes back.
      if (entry.drawn && entry.frame) entry.frame.style.visibility = "";
      if (entry.texture) engineRef.current?.free(entry.texture);
      wakeRef.current?.();
    };
  }, []);

  useLenis(
    useCallback(() => {
      scrolledRef.current?.(performance.now());
    }, [])
  );

  useEffect(() => {
    if (reducedMotion) return;

    const entries = entriesRef.current!;
    let engine: VeilEngine | null = null;
    let stopped = false;

    let raf = 0;
    let last = performance.now();
    let lastScrollAt = 0;
    let flow = 0;
    let idle = 0;
    let lastScrollY = Number.NaN;
    let lastVw = 0;
    let lastVh = 0;
    let suspended = false;
    /**
     * Whether the entries need looking at even though the page has not moved.
     * "Nothing scrolled" is not the same as "nothing to do": a photo mounts,
     * an image finishes decoding, an upload waits its turn, the window
     * resizes. Everything that wakes the loop raises this, and a pass that
     * finds no work left lowers it again — which is what finally lets a page
     * at rest stop drawing.
     */
    let pending = true;

    const resolve = (entry: Entry): HTMLElement | null => {
      // Photo renders <div frame><img/></div> and the <img> is there from the
      // first paint, lazy or not. Re-read if the frame has left the document,
      // which is what a React re-mount underneath us looks like from here.
      if (entry.frame?.isConnected) return entry.frame;
      const img = entry.el.querySelector("img");
      entry.img = img;
      entry.frame = img?.parentElement ?? null;
      return entry.frame;
    };

    const reveal = (entry: Entry) => {
      if (!entry.drawn) return;
      if (entry.frame) entry.frame.style.visibility = "";
      entry.drawn = false;
    };

    const conceal = (entry: Entry) => {
      if (entry.drawn || !entry.frame) return;
      entry.frame.style.visibility = "hidden";
      entry.drawn = true;
    };

    const retire = (entry: Entry) => {
      reveal(entry);
      if (entry.texture) {
        engine?.free(entry.texture);
        entry.texture = null;
        entry.src = "";
      }
    };

    /** Everything back to the browser, in one paint. */
    const handBack = () => {
      for (const entry of entries) retire(entry);
      engine?.frame([]);
    };

    const park = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const wake = () => {
      // Before the early return: a wake that finds the loop already running
      // still has to be told about, or the news arrives on a frame that has
      // decided there is nothing to look at.
      pending = true;
      if (raf || stopped || suspended || !engine?.alive) return;
      idle = 0;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const commit = (now: number) => {
      if (stopped || suspended || !engine) return;
      if (!engine.alive) {
        // The driver took the context away. Hand every photo back before the
        // page is left standing in front of a canvas that can't draw.
        handBack();
        park();
        return;
      }

      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const velocity = speed.get();
      // The layout viewport, which is the space getBoundingClientRect()
      // measures in — see the note on resize() in lib/scrollVeilGl.ts.
      const view = document.documentElement;
      const vw = view.clientWidth;
      const vh = view.clientHeight;
      const scrollY = window.scrollY;

      // Nothing scrolled, nothing sprung, nothing resized and nothing waiting:
      // this frame would be identical to the last one, so it isn't drawn.
      const still =
        velocity === 0 && scrollY === lastScrollY && vw === lastVw && vh === lastVh;
      lastScrollY = scrollY;
      lastVw = vw;
      lastVh = vh;
      const nothingToDo = still && !pending;
      idle = nothingToDo ? idle + 1 : 0;
      if (nothingToDo) return;

      // Distance scrolled, not time elapsed: the wave crawls with the visitor
      // and holds still the moment they do.
      flow += velocity * FLOW_RATE * dt;

      const keepMargin = Math.max(DRAW_MARGIN * 2, vh * KEEP_MARGIN_VH);
      const quads: VeilQuad[] = [];
      const shown: Entry[] = [];
      let uploads = 0;
      let waitingOnUpload = false;

      for (const entry of entries) {
        const frame = resolve(entry);
        if (!frame) continue;

        const r = frame.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) {
          retire(entry);
          continue;
        }
        if (r.bottom <= -keepMargin || r.top >= vh + keepMargin) {
          retire(entry);
          continue;
        }

        const img = entry.img;
        if (!img?.complete || img.naturalWidth === 0) {
          // Still loading: the browser has an LQIP to show and we have
          // nothing, so it keeps the photo. A decode finishing is not
          // movement and would never wake the loop by itself, so it is asked
          // to say when it lands.
          if (img && !entry.waiting) {
            entry.waiting = true;
            img.addEventListener("load", wake, { once: true });
          }
          reveal(entry);
          continue;
        }
        entry.waiting = false;

        // One upload per frame. texImage2D plus generateMipmap on a 2560px
        // film scan is tens of milliseconds, and several of them in the frame
        // where a fling brings three photos into range at once is a stutter
        // in the one place this effect exists to be smooth. A photo without
        // its texture yet simply stays with the browser for a frame or two.
        const src = img.currentSrc || img.src;
        if (!entry.texture || entry.src !== src) {
          if (uploads < UPLOADS_PER_FRAME) {
            uploads++;
            const next = engine.upload(img);
            if (next) {
              if (entry.texture) engine.free(entry.texture);
              entry.texture = next;
              entry.src = src;
            }
          } else if (!entry.texture) {
            // Its turn is next frame, and until then the loop has to keep
            // running even if the page is standing perfectly still.
            waitingOnUpload = true;
          }
        }
        if (!entry.texture) {
          reveal(entry);
          continue;
        }

        if (r.bottom <= -DRAW_MARGIN || r.top >= vh + DRAW_MARGIN) {
          reveal(entry);
          continue;
        }

        // How much of its arrival a photo still owes: 1 at the bottom of the
        // viewport, 0 once it has reached reading position. It only ever
        // *adds* to what the scroll is already doing, so a photo arriving on
        // a slow scroll still arrives quietly.
        const owed = clamp01((r.top - vh * ARRIVED_AT) / (vh * (1 - ARRIVED_AT)));
        const strength = Math.pow(Math.abs(velocity), AMP_CURVE);

        quads.push({
          rect: { x: r.left, y: r.top, w: r.width, h: r.height },
          texture: entry.texture,
          amp: Math.min(1, strength * (1 + ENTRY_BOOST * owed)),
          drift: velocity < 0 ? -strength : strength,
          flow,
          phase: entry.phase,
        });
        shown.push(entry);
      }

      pending = waitingOnUpload;

      engine.frame(quads);
      // Only now, with the stand-ins already drawn into this frame's buffer:
      // the draw and the visibility change land in the same paint, so there
      // is no frame in which a photo is either doubled or missing.
      for (const entry of shown) conceal(entry);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // Lenis moves the page in its own rAF and calls us straight after; for
      // as long as it is doing that it owns the timing, and measuring here
      // would measure the page one frame before it moves.
      if (now - lastScrollAt < SCROLL_OWNS_MS) return;
      commit(now);
      if (idle > IDLE_FRAMES) park();
    };

    const onScrolled = (now: number) => {
      lastScrollAt = now;
      commit(now);
      // Keep a loop running afterwards: the velocity spring goes on settling
      // for a few frames after the last scroll event.
      wake();
    };

    /**
     * The cloth morph draws photographs too, on its own canvas, and for the
     * length of a flight it is the one in charge: this hands everything back
     * to the DOM *before* the flight hides the photo it is taking off from
     * (see lib/clothMorphFlight.ts, which raises the signal first thing).
     * Arriving on a category page mid-flight, the class on <html> says a
     * flight is already in the air.
     */
    const suspend = () => {
      if (suspended) return;
      suspended = true;
      park();
      handBack();
      engine?.detach();
    };
    const resume = () => {
      if (!suspended) return;
      suspended = false;
      wake();
    };

    import("@/lib/scrollVeilGl")
      .then(({ createVeil }) => {
        if (stopped) return;
        engine = createVeil();
        if (!engine) return;
        engineRef.current = engine;
        wakeRef.current = wake;
        scrolledRef.current = onScrolled;
        suspended = document.documentElement.classList.contains(MORPH_GATE);
        setActive(true);
        wake();
      })
      .catch(() => {
        // No shader, no veil: components/ScrollTilt.tsx keeps the page.
      });

    window.addEventListener(MORPH_START, suspend);
    window.addEventListener(MORPH_END, resume);
    window.addEventListener("resize", wake);
    // Lenis is the usual source of movement, but not the only one: a
    // scrollbar drag or a jump to an anchor arrives here.
    window.addEventListener("scroll", wake, { passive: true });
    const unsubscribe = speed.on("change", wake);

    return () => {
      stopped = true;
      park();
      unsubscribe();
      window.removeEventListener(MORPH_START, suspend);
      window.removeEventListener(MORPH_END, resume);
      window.removeEventListener("resize", wake);
      window.removeEventListener("scroll", wake);
      wakeRef.current = null;
      scrolledRef.current = null;
      engineRef.current = null;
      for (const entry of entries) retire(entry);
      engine?.destroy();
      setActive(false);
    };
  }, [reducedMotion, speed]);

  const api = useMemo<VeilApi>(() => ({ active, register }), [active, register]);

  return <VeilContext.Provider value={api}>{children}</VeilContext.Provider>;
}

/**
 * Marks one photo as the veil's to draw. Renders a plain wrapper — the
 * effect needs an element to find the photo under and to measure, and a
 * block box here is layout-neutral inside the sequence's tile frame.
 *
 * `enabled` is the caller's veto, for a photo the canvas would ruin: a
 * wigglegram is a <video> laid over the still (components/LoopVideo.tsx),
 * and the veil only ever has the still, so those keep the browser and the
 * scroll-linked tilt.
 */
export function Veil({
  enabled = true,
  children,
}: {
  enabled?: boolean;
  children: ReactNode;
}) {
  const { active, register } = useContext(VeilContext);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !enabled) return;
    const el = ref.current;
    if (!el) return;
    return register(el);
  }, [active, enabled, register]);

  return <div ref={ref}>{children}</div>;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
