"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef, useState, ViewTransition } from "react";
import { Photo } from "@/components/Photo";
import { Reveal } from "@/components/Reveal";
import type { Category } from "@/lib/content";
import { GRID_TILE, tileSizes } from "@/lib/imageSizes";
import { ease } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * One cover on the homepage grid. Hover brings colour into the (otherwise
 * grayscale) photo, scales it slightly within its frame, and — driven by
 * the parent's hoveredSlug — dims every sibling tile to push focus onto
 * whichever one the cursor is over.
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
      <Reveal>
        <motion.div
          // The parallax transform is rewritten every scroll frame. Without
          // an explicit promotion hint the browser is free to repaint the
          // tile — a multi-megapixel photo — instead of just moving an
          // existing layer, which is the difference between a composite and
          // a raster on every frame of every scroll.
          style={{ y, willChange: reducedMotion ? undefined : "transform" }}
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
                  sizes={tileSizes(GRID_TILE[category.cover.orientation])}
                  grayscale={!hovered}
                  style={{ borderRadius: 2 }}
                />
              </motion.div>
            </ViewTransition>
            <ViewTransition name={`title-${category.slug}`} share="title-morph" default="none">
              <div
                className="flex items-baseline justify-between"
                style={{ marginTop: "0.9rem" }}
              >
                <span className="font-display text-[var(--step-1)]">
                  {category.title}
                </span>
                <span className="font-sans text-[var(--step--1)] tracking-[0.15em] text-grey-500 uppercase">
                  {String(category.photos.length).padStart(2, "0")} photos
                </span>
              </div>
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
      </Reveal>
    </div>
  );
}
