"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { Photo } from "@/components/Photo";
import type { Photo as PhotoType } from "@/lib/content";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * The About page portrait, drifting slowly as the page scrolls — the one
 * deliberately slow, understated parallax on the site (everything else on
 * this page is static text), which is what makes it read as a portrait
 * rather than a gallery shot.
 */
export function AboutPortrait({ photo }: { photo: PhotoType }) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const rawY = useTransform(scrollYProgress, [0, 1], [-24, 24]);
  const y = reducedMotion ? 0 : rawY;

  return (
    <div ref={ref} style={{ overflow: "hidden" }}>
      {/* Promoted for the same reason as the homepage tiles: a scroll-driven
          transform on a full-size photo should composite, not repaint. */}
      <motion.div style={{ y, willChange: reducedMotion ? undefined : "transform" }}>
        <Photo
          photo={photo}
          sizes="(max-width: 767px) 100vw, 40vw"
          priority
          style={{ borderRadius: 2 }}
        />
      </motion.div>
    </div>
  );
}
