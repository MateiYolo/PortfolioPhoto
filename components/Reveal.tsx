"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { duration, ease } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Scroll-triggered mask wipe: the content is clipped out of view and wipes
 * in as it enters the viewport. Used for anything that should feel
 * "revealed" rather than just faded in (section headers, photo blocks).
 *
 * Always animates the same property (clip-path) regardless of reduced
 * motion; only the transition duration changes (near-instant when
 * reduced). This matters: useReducedMotion() reports `false` on first
 * render and corrects itself a tick later (see lib/useReducedMotion.ts),
 * so if the two branches animated *different* CSS properties, Motion
 * would leave the abandoned property (e.g. clip-path) stuck at its
 * initial hidden value forever when the branch switched underneath it,
 * and content would mount and then silently vanish. Keeping the animated
 * property constant sidesteps that entirely.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
  duration: durationProp = duration.slow,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li";
  duration?: number;
}) {
  const reducedMotion = useReducedMotion();
  const MotionTag = motion[Tag];

  return (
    <MotionTag
      className={className}
      style={{ overflow: "hidden" }}
      initial={{ clipPath: "inset(100% 0 0 0)" }}
      whileInView={{ clipPath: "inset(0% 0 0 0)" }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{
        duration: reducedMotion ? 0.01 : durationProp,
        ease: ease.inOutQuart,
        delay: reducedMotion ? 0 : delay,
      }}
    >
      {children}
    </MotionTag>
  );
}
