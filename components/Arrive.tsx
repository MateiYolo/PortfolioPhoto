"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useIntroReady } from "@/lib/intro";
import { ease } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Mount-time entrance for type that is already on screen when a page
 * arrives.
 *
 * The photo morph owns the first stretch of a navigation, so this waits it
 * out and then lifts the supporting text in underneath the travelling
 * photo, rather than having it sit there fully formed the instant the
 * route changes. `::view-transition-new` renders live content, so the rise
 * is visible through the transition itself.
 *
 * Deliberately not scroll-triggered: this is the above-the-fold case that
 * <Reveal> and <ScrollTilt> cannot cover, since neither fires for content
 * that is already in view on the first frame.
 *
 * A cold load has a second thing owning its opening: the intro panel
 * (components/Intro.tsx). Same reasoning as the photo morph, so the same
 * answer — wait for it, then lift in underneath it.
 */
export function Arrive({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const introReady = useIntroReady();

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={introReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{
        duration: reducedMotion ? 0.01 : 0.9,
        ease: ease.outExpo,
        delay: reducedMotion ? 0 : 0.4 + delay,
      }}
    >
      {children}
    </motion.div>
  );
}
