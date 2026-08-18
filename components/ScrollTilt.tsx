"use client";

import { motion, useInView, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useScrollVelocityFactor } from "@/components/ScrollVelocity";

/** Degrees a photo lies back by when it is at the very bottom of the viewport. */
const ENTRY_TILT = 9;
/** Pixels it trails behind its final position. */
const ENTRY_LAG = 22;
/** Extra degrees at full scroll speed, applied to every photo on screen. */
const DRAG_TILT = 4.5;
/** How much of the entry pose is left showing when the page is barely moving. */
const REST_SHARE = 0.35;
/** How far outside the viewport a photo starts and stops being driven. */
const ACTIVE_MARGIN = "300px";

/**
 * Scroll-linked settle, used instead of a triggered reveal.
 *
 * Nothing here waits to be "revealed": the photo is fully visible the
 * whole time. What changes is how it sits in space, and that comes from
 * two things at once.
 *
 * Position: while a photo is low in the viewport it lies back, hinged on
 * its bottom edge, and comes level with the screen as it reaches reading
 * position.
 *
 * Speed: the harder the visitor scrolls, the further everything on screen
 * leans away from the direction of travel, and the more of that entry
 * pose is allowed to show. Ease off and the page settles back to level.
 * This is the difference between an animation that plays at you and one
 * that answers you: drift down the page and the photos barely move,
 * throw the page and they lean into it.
 *
 * The rotation is on one axis only. A photograph leaning away from the
 * reader is a plane in space; the same photograph also swivelling on Y is
 * a crooked frame, which is the thing this is trying not to look like.
 *
 * The perspective lives on the outer wrapper and the rotation on the
 * inner element, because perspective only applies to a child's transform.
 * That split is also why `ref` sits on the wrapper: useScroll measures the
 * target's box, and measuring an element that our own transform is moving
 * would feed back into itself.
 *
 * Reduced motion is handled in CSS (see [data-scroll-tilt] in globals.css)
 * rather than by swapping element types here, which would remount the
 * image underneath.
 */
export function ScrollTilt({
  children,
  intensity = 1,
  className,
  style,
}: {
  children: ReactNode;
  /** Scales the whole effect; 0 disables it. */
  intensity?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const speed = useScrollVelocityFactor();

  // Anything well off screen is dropped out of the frame loop entirely and
  // un-promoted: no style writes, and no compositor layer held open for a
  // full-bleed photograph nobody can see. The margin means the handover
  // always happens out of sight.
  const active = useInView(ref, { margin: ACTIVE_MARGIN });

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start 55%"],
  });

  // How much of the entry pose is still owed: 1 at the bottom of the
  // viewport, 0 once the photo has arrived.
  const owed = useTransform(scrollYProgress, [0, 1], [1, 0]);

  const rotateX = useTransform([owed, speed], ([o, v]: number[]) =>
    (o * ENTRY_TILT * share(v) + v * DRAG_TILT) * intensity
  );
  const y = useTransform([owed, speed], ([o, v]: number[]) =>
    o * ENTRY_LAG * share(v) * intensity
  );

  return (
    <div
      ref={ref}
      className={className}
      style={{ perspective: "1400px", ...style }}
    >
      <motion.div
        data-scroll-tilt
        style={{
          rotateX: active ? rotateX : 0,
          y: active ? y : 0,
          transformOrigin: "50% 100%",
          transformStyle: "preserve-3d",
          backfaceVisibility: "hidden",
          willChange: active ? "transform" : "auto",
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * What proportion of the entry pose is showing right now. A photo drifting
 * into view on a slow scroll barely tilts; the same photo thrown up the
 * screen gets the full pose.
 */
function share(velocityFactor: number) {
  return REST_SHARE + (1 - REST_SHARE) * Math.abs(velocityFactor);
}
