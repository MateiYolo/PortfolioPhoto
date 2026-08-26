"use client";

import { motion } from "motion/react";
import { ease } from "@/lib/motion";
import type { Edge } from "@/lib/pointerEdge";

const UNDERLINE = {
  in: { duration: 0.4, ease: ease.sweep },
  out: { duration: 0.3, ease: ease.outExpo },
};

/**
 * The underline every text link on this site answers the cursor with:
 * it grows from the edge the pointer entered by and collapses out of the
 * edge it left by (lib/pointerEdge.ts, paired with lib/useEdgeHover.ts),
 * in place of the magnetic pull a link this size used to wobble under —
 * see AvailabilityBadge's own note on why that went. Arriving is the half
 * worth watching, so it gets the longer sweep; leaving is brisk.
 *
 * Give the wrapping element `position: relative` and this stretches to
 * its full width, so it underlines exactly what it's wrapped around.
 */
export function HoverUnderline({
  hovered,
  origin,
  reducedMotion,
  onSweepStart,
  onSweepEnd,
}: {
  hovered: boolean;
  origin: Edge;
  reducedMotion: boolean;
  onSweepStart?: () => void;
  onSweepEnd?: () => void;
}) {
  const stroke = hovered ? UNDERLINE.in : UNDERLINE.out;

  return (
    <motion.span
      aria-hidden
      onAnimationStart={onSweepStart}
      onAnimationComplete={onSweepEnd}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "0.08em",
        height: "2px",
        background: "currentColor",
        transformOrigin: origin,
      }}
      initial={false}
      animate={{ scaleX: hovered ? 1 : 0 }}
      transition={{
        duration: reducedMotion ? 0.01 : stroke.duration,
        ease: stroke.ease,
      }}
    />
  );
}
