"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef, useState, ViewTransition } from "react";
import { Photo } from "@/components/Photo";
import { ScrollTilt } from "@/components/ScrollTilt";
import type { Category } from "@/lib/content";
import { ease } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * One cover on the homepage grid. Hover brings colour into the (otherwise
 * grayscale) photo, scales it slightly within its frame, and, driven by
 * the parent's hoveredSlug, dims every sibling tile to push focus onto
 * whichever one the cursor is over.
 *
 * Only the title is set under the photo. No counts, no metadata: the grid
 * is a list of places to go, not a table of contents.
 */
export function CategoryTile({
  category,
  parallaxRange,
  dimmed,
  onHoverChange,
}: {
  category: Category;
  parallaxRange: [number, number];
  dimmed: boolean;
  onHoverChange: (slug: string | null) => void;
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
          style={{ y }}
          onPointerEnter={() => {
            setHovered(true);
            onHoverChange(category.slug);
          }}
          onPointerLeave={() => {
            setHovered(false);
            onHoverChange(null);
          }}
          animate={{ opacity: dimmed ? 0.35 : 1 }}
          transition={{ duration: 0.5, ease: ease.inOutQuart }}
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
                  sizes="(max-width: 767px) 100vw, 65vw"
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
            <span
              aria-hidden
              className="block bg-ink"
              style={{
                height: 1,
                marginTop: "0.4rem",
                transformOrigin: "left",
                transform: `scaleX(${hovered ? 1 : 0})`,
                transition: "transform 500ms cubic-bezier(0.65,0,0.35,1)",
              }}
            />
          </Link>
        </motion.div>
      </ScrollTilt>
    </div>
  );
}
