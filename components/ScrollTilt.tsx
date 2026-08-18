"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * Scroll-linked settle, used instead of a triggered reveal.
 *
 * Nothing here waits to be "revealed": the photo is fully visible the whole
 * time. While it is still low in the viewport it lies back in space, hinged
 * on its bottom edge like a print being stood upright, and it comes level
 * with the screen as it reaches reading position. Because every value is
 * bound to scroll progress rather than a one-shot trigger, scrolling back
 * up lays it down again and Lenis inertia gives the settle its weight, so
 * a long sequence never plays the same canned animation twice.
 *
 * The rotation is real 3D (rotateX under a perspective, plus a little
 * rotateY so consecutive photos swivel from opposite sides) rather than a
 * flat rotate/skew, which is what makes it read as depth instead of as a
 * crooked frame.
 *
 * The perspective lives on the outer wrapper and the rotation on the inner
 * element, because perspective only applies to a child's transform. That
 * split is also why `ref` sits on the wrapper: useScroll measures the
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

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start 55%"],
  });

  const rotateX = useTransform(scrollYProgress, [0, 1], [15 * intensity, 0]);
  const rotateY = useTransform(scrollYProgress, [0, 1], [direction * 6 * intensity, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [56 * intensity, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1 - 0.03 * intensity, 1]);

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
