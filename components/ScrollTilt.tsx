"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * Scroll-linked settle, used instead of a triggered reveal.
 *
 * Nothing here waits to be "revealed": the photo is fully visible the whole
 * time. While it is still low in the viewport it sits tilted, slightly
 * sheared and pushed down, as if it were being dragged up into place, and
 * it straightens as it reaches reading position. Because every value is
 * bound to scroll progress rather than a one-shot trigger, scrolling back
 * up puts the tilt back and Lenis inertia gives the settle its weight, so
 * a long sequence never plays the same canned animation twice.
 *
 * The transform origin sits at the top edge, so the bottom of the frame is
 * what swings: the image reads as being pulled, not spun.
 *
 * `ref` deliberately lives on a plain wrapper rather than on the animated
 * element. useScroll measures the target's box, and measuring an element
 * that our own transform is moving would feed back into itself.
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
  /** 1 tilts clockwise into place, -1 counter-clockwise. Alternate them. */
  direction?: 1 | -1;
  /** Scales the whole effect; 0 disables it. */
  intensity?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start 55%"],
  });

  const rotate = useTransform(scrollYProgress, [0, 1], [direction * 3.6 * intensity, 0]);
  const skewY = useTransform(scrollYProgress, [0, 1], [direction * -1.2 * intensity, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [64 * intensity, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1 - 0.05 * intensity, 1]);

  return (
    <div ref={ref} className={className} style={style}>
      <motion.div
        data-scroll-tilt
        style={{
          rotate,
          skewY,
          y,
          scale,
          transformOrigin: "50% 0%",
          willChange: "transform",
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
