"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef, useState, ViewTransition } from "react";
import { Photo } from "@/components/Photo";
import { ScrollTilt } from "@/components/ScrollTilt";
import type { Category } from "@/lib/content";
import { GRID_TILE, tileSizes } from "@/lib/imageSizes";
import { ease } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * One cover on the homepage grid. Hover brings colour into the (otherwise
 * grayscale) photo and scales it slightly within its frame.
 *
 * Only the title is set under the photo. No counts, no metadata: the grid
 * is a list of places to go, not a table of contents.
 */
export function CategoryTile({
  category,
  parallaxRange,
}: {
  category: Category;
  parallaxRange: [number, number];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const rawY = useTransform(scrollYProgress, [0, 1], parallaxRange);
  const y = reducedMotion ? 0 : rawY;

  return (
    <div ref={ref}>
      <ScrollTilt intensity={0.7}>
        <motion.div
          // No promotion hint here on purpose: ScrollTilt already holds a
          // compositor layer open around this subtree, and it drops that
          // layer once the tile leaves the screen. A second permanent
          // will-change would pin a full-size photo texture in memory for
          // every tile on the page, on top of the one already held.
          style={{ y }}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        >
          <Link
            href={`/work/${category.slug}`}
            data-cursor="view"
            className="group block"
          >
            <ViewTransition name={`photo-${category.slug}`} share="morph" default="none">
              <motion.div
                animate={{ scale: hovered ? 1.04 : 1 }}
                transition={{ duration: 0.6, ease: ease.inOutQuart }}
              >
                <Photo
                  photo={category.cover}
                  sizes={tileSizes(GRID_TILE[category.cover.orientation])}
                  grayscale={!hovered}
                  style={{ borderRadius: 2 }}
                />
              </motion.div>
            </ViewTransition>
            <ViewTransition name={`title-${category.slug}`} share="title-morph" default="none">
              <span
                className="font-display block text-[var(--step-1)]"
                style={{ marginTop: "0.9rem" }}
              >
                {category.title}
              </span>
            </ViewTransition>
          </Link>
        </motion.div>
      </ScrollTilt>
    </div>
  );
}
