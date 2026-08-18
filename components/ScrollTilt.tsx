"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useScrollVelocityFactor } from "@/components/ScrollVelocity";

/** Degrees a photo lies back by when it is at the very bottom of the viewport. */
const ENTRY_TILT = 16;
/** Degrees it swivels off-axis on the way in. */
const ENTRY_SWIVEL = 6;
/** Pixels it trails behind its final position. */
const ENTRY_LAG = 56;
/** Extra degrees at full scroll speed, applied to every photo on screen. */
const DRAG_TILT = 8;
/** How much of the entry tilt survives when the page is barely moving. */
const REST_SHARE = 0.3;

/**
 * Scroll-linked settle, used instead of a triggered reveal.
 *
 * Nothing here waits to be "revealed": the photo is fully visible the
 * whole time. What changes is how it sits in space, and that comes from
 * two things at once.
 *
 * Position: while a photo is low in the viewport it lies back, hinged on
 * its bottom edge like a print being stood upright, and comes level with
 * the screen as it reaches reading position.
 *
 * Speed: the harder the visitor scrolls, the further everything on screen
 * leans away from the direction of travel, and the more of that entry
 * tilt is allowed to show. Ease off and the whole page settles back to
 * level under its own spring. This is the difference between an animation
 * that plays at you and one that answers you: drift down the page and the
 * photos barely move, throw the page and they lean into it.
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
  direction = 1,
  intensity = 1,
  className,
  style,
}: {
  children: ReactNode;
  /** Which side the photo swivels in from. Alternate them down a page. */
  direction?: 1 | -1;
  /** Scales the whole effect; 0 disables it. */
  intensity?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const speed = useScrollVelocityFactor();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start 55%"],
  });

  // How much of the entry pose is still owed: 1 at the bottom of the
  // viewport, 0 once the photo has arrived.
  const owed = useTransform(scrollYProgress, [0, 1], [1, 0]);

  const rotateX = useTransform([owed, speed], ([o, v]: number[]) => {
    return (o * ENTRY_TILT * share(v) + v * DRAG_TILT) * intensity;
  });
  const rotateY = useTransform([owed, speed], ([o, v]: number[]) => {
    return o * direction * ENTRY_SWIVEL * share(v) * intensity;
  });
  const y = useTransform([owed, speed], ([o, v]: number[]) => {
    return o * ENTRY_LAG * share(v) * intensity;
  });
  const scale = useTransform([owed, speed], ([o, v]: number[]) => {
    return 1 - o * 0.03 * share(v) * intensity;
  });

  return (
    <div
      ref={ref}
      className={className}
      style={{ perspective: "1150px", perspectiveOrigin: "50% 30%", ...style }}
    >
      <motion.div
        data-scroll-tilt
        style={{
          rotateX,
          rotateY,
          y,
          scale,
          transformOrigin: "50% 100%",
          transformStyle: "preserve-3d",
          willChange: "transform",
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
