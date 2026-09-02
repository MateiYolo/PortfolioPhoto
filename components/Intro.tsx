"use client";

import { useLenis } from "lenis/react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  type MotionValue,
} from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { IntroReadyContext } from "@/lib/intro";
import { ease } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Shortest the panel is ever up for, measured from the navigation. A warm
 * cache resolves everything below in a frame or two, and a panel that appears
 * and vanishes inside 100ms is a flash, not an entrance.
 */
const MIN_MS = 700;
/**
 * ...and the longest, whatever is still outstanding. This is a courtesy, not
 * a loading gate: past it the page is shown in whatever state it is in, which
 * is the same state it would have been shown in with no panel at all.
 */
const MAX_MS = 4000;
/** Beat between the counter reaching 100 and the panel starting to lift. */
const SETTLE_MS = 180;
/** The lift itself. */
const LIFT_MS = 900;
/** ...which starts fractionally after the bottom row has gone. */
const LIFT_DELAY_MS = 160;

type Phase = "holding" | "leaving" | "gone";

/**
 * The panel over a cold load, and the thing that decides when the page
 * underneath is ready to be looked at.
 *
 * The problem it solves is specific. A first load of this site has to do all
 * of its expensive work at once: two web fonts, Lenis and Motion hydrating,
 * and — the costly part — several full-width AVIFs whose film grain makes
 * them 28-125ms of decode each (see the note in components/Photo.tsx). None
 * of that is slow enough to read as "loading", and all of it lands in the
 * same handful of frames, which is exactly the shape of a stutter: the page
 * is *there*, and then it hitches. So rather than make any of it faster, this
 * moves it somewhere it cannot be seen. The panel holds until the fonts have
 * loaded and every photo already in the viewport has finished decoding, and
 * only then hands the page over — by which point the first frames the visitor
 * actually sees have nothing left to do but composite.
 *
 * Three things share one clock, which is what keeps it from feeling like a
 * splash screen bolted on top:
 *
 *  - the hairline across the bottom fills with real progress, one notch per
 *    asset settled, so the counter is reporting rather than performing;
 *  - the panel lifts up and off, on the site's own out-curve;
 *  - the type underneath rises *with* it — <SplitText> and <Arrive> hold
 *    their entrance until this says go (see lib/intro.ts), so the hero
 *    arrives as the panel clears it, in the same direction, rather than
 *    being revealed already finished.
 *
 * Reduced motion keeps the hold (it is what makes the page smooth, and it
 * is not motion) and drops the choreography: no counter creep, no lift, the
 * panel is simply gone.
 *
 * Mounted once, in the root layout, so it runs on a document load and never
 * again: a client navigation moves through a view transition instead.
 */
export function Intro({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const lenis = useLenis();
  const [phase, setPhase] = useState<Phase>("holding");
  const progress = useMotionValue(0);

  const ready = phase !== "holding";
  const locked = phase !== "gone";

  useEffect(() => {
    if (phase !== "holding") return;

    let cancelled = false;
    let left = false;

    const leave = () => {
      if (cancelled || left) return;
      left = true;
      // Already at (or near) 1 on the normal path, since every job has
      // reported by now. This is the catch-up for the MAX_MS path, where the
      // bar is wherever the slow asset left it.
      animate(progress, 1, { duration: reducedMotion ? 0 : 0.26, ease: ease.outExpo });
      const wait = reducedMotion ? 0 : Math.max(SETTLE_MS, MIN_MS - performance.now());
      window.setTimeout(() => {
        if (!cancelled) setPhase("leaving");
      }, wait);
    };

    // Both bounds are measured from the navigation, not from this effect —
    // performance.now() is already relative to it. That matters in the
    // direction you'd expect it to: hydration is one of the things the panel
    // is covering for, so time spent waiting to run this should come *out* of
    // the minimum rather than be added on top of it, and a slow one should
    // still be released on the same clock as a fast one.
    const cap = window.setTimeout(leave, Math.max(SETTLE_MS, MAX_MS - performance.now()));

    // One frame late on purpose: the browser's own scroll restoration and
    // <RouteScrollReset> both land before this, so the photos measured below
    // are the ones the page is actually opening on.
    const frame = requestAnimationFrame(() => {
      const jobs = pending();
      const total = jobs.length || 1;
      let done = 0;

      const step = () => {
        done += 1;
        if (!cancelled) {
          animate(progress, done / total, {
            duration: reducedMotion ? 0 : 0.5,
            ease: ease.outExpo,
          });
        }
      };

      for (const job of jobs) job.then(step, step);

      Promise.allSettled(jobs).then(() => {
        // Two frames of grace. The decodes have resolved, but the first
        // composite that uses them has not happened yet, and neither has
        // whatever hydration was queued behind them. Both belong under the
        // panel rather than in the first frames of the page.
        requestAnimationFrame(() => requestAnimationFrame(leave));
      });
    });

    return () => {
      cancelled = true;
      window.clearTimeout(cap);
      cancelAnimationFrame(frame);
    };
  }, [phase, progress, reducedMotion]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const id = window.setTimeout(
      () => setPhase("gone"),
      reducedMotion ? 20 : LIFT_DELAY_MS + LIFT_MS
    );
    return () => window.clearTimeout(id);
  }, [phase, reducedMotion]);

  // Nothing scrolls behind a panel: a wheel or a drag over it would move a
  // page nobody can see, and the lift would open on somewhere the visitor
  // never chose to be. Lenis owns the scroll (components/SmoothScroll.tsx),
  // so it is the one that has to be told.
  useEffect(() => {
    if (!lenis || !locked) return;
    lenis.stop();
    return () => lenis.start();
  }, [lenis, locked]);

  return (
    <IntroReadyContext.Provider value={ready}>
      {children}
      {phase !== "gone" && (
        <>
          {/* No JavaScript, no panel: nothing below this line will ever run
              to take it away, and a permanently covered site is a worse
              failure than an unsmoothed first paint. */}
          <noscript
            dangerouslySetInnerHTML={{
              __html: "<style>.intro-panel{display:none!important}</style>",
            }}
          />
          <motion.div
            className="intro-panel"
            // Not aria-hidden: for the length of the hold this *is* the page,
            // and hiding it would leave a screen reader on an empty document.
            role="presentation"
            initial={false}
            animate={{
              // Collapses to the top edge: the panel travels up and off, the
              // same direction the type underneath is rising in.
              clipPath: phase === "leaving" ? "inset(0 0 100% 0)" : "inset(0 0 0 0)",
            }}
            transition={{
              duration: reducedMotion ? 0.01 : LIFT_MS / 1000,
              ease: ease.outExpo,
              delay: reducedMotion ? 0 : LIFT_DELAY_MS / 1000,
            }}
          >
            <motion.div
              className="intro-panel-foot"
              initial={false}
              animate={{
                opacity: phase === "leaving" ? 0 : 1,
                y: phase === "leaving" ? 8 : 0,
              }}
              transition={{
                duration: reducedMotion ? 0.01 : 0.28,
                ease: ease.inOutQuart,
              }}
            >
              <span className="intro-panel-rule">
                <motion.span
                  className="intro-panel-rule-ink"
                  style={{ scaleX: progress }}
                />
              </span>
              <span className="intro-panel-row">
                {/* Same name the document title carries (app/layout.tsx). */}
                <span>Matei Convard</span>
                <Counter progress={progress} />
              </span>
            </motion.div>
          </motion.div>
        </>
      )}
    </IntroReadyContext.Provider>
  );
}

/**
 * The percentage, in its own component so the hundred renders it takes to
 * count up redraw three digits rather than the whole panel.
 */
function Counter({ progress }: { progress: MotionValue<number> }) {
  const [percent, setPercent] = useState(0);

  useMotionValueEvent(progress, "change", (value) => {
    setPercent(Math.round(value * 100));
  });

  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {String(percent).padStart(3, "0")}
    </span>
  );
}

/**
 * Everything worth holding the page for: the fonts, and each photo that is
 * already on screen.
 *
 * Deliberately not "every image on the page" — the homepage carries a cover
 * per category and the sequence pages carry a whole set, and waiting on all
 * of them would be waiting on the archive. Everything past the fold is
 * already warmed ahead of the scroll by the photo's own observer (see
 * warmMargin in components/Photo.tsx), which is the right mechanism for it;
 * this is only concerned with the first screen.
 */
function pending(): Promise<unknown>[] {
  const jobs: Promise<unknown>[] = [];

  if (document.fonts) jobs.push(document.fonts.ready);

  const fold = window.innerHeight * 1.1;
  for (const img of Array.from(document.images)) {
    const box = img.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    if (box.bottom < 0 || box.top > fold) continue;
    jobs.push(decoded(img));
  }

  return jobs;
}

/**
 * Resolves once a photo is ready to *paint*, not merely downloaded — the
 * decode is the expensive half, and the point of the panel is to spend it
 * here. Rejections (a broken image, a browser that will not decode an
 * off-screen one) settle rather than propagate: a photo that failed is one
 * the visitor is not waiting for either way.
 */
function decoded(img: HTMLImageElement): Promise<unknown> {
  if (typeof img.decode === "function") return img.decode().catch(() => {});
  if (img.complete) return Promise.resolve();
  return new Promise<void>((resolve) => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });
}
