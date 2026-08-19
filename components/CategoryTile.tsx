"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef, useState, ViewTransition } from "react";
import { Photo } from "@/components/Photo";
import { ScrollTilt } from "@/components/ScrollTilt";
import {
  beginClothMorph,
  prewarmClothMorph,
  readSaturation,
} from "@/lib/clothMorph";
import type { Category } from "@/lib/content";
import { GRID_TILE, tileSizes } from "@/lib/imageSizes";
import { ease } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * One cover on the homepage grid. Hover brings colour into the (otherwise
 * grayscale) photo and scales it slightly within its frame.
 *
 * Only the caption is set under the photo. No counts, no metadata: the grid
 * is a list of places to go, not a table of contents.
 */
export function CategoryTile({
  category,
  parallaxRange,
  imageParallaxRange,
}: {
  category: Category;
  parallaxRange: [number, number];
  /** See IMAGE_PARALLAX_PATTERN in CategoryGrid.tsx. */
  imageParallaxRange: [number, number];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedMotion();

  /**
   * Hands the cover photo to the WebGL cloth morph (lib/clothMorph.ts) and
   * lets the Link navigate underneath it. Everything here is measured before
   * the navigation starts, because after it the tile is unmounted.
   *
   * Returning silently is the fallback: the <ViewTransition> below is still in
   * the markup, so a browser without WebGL2 — or a visitor who asked for less
   * motion — simply gets the native morph, which is what the site shipped with.
   */
  const handOffToCloth = () => {
    if (reducedMotion) return;
    // Photo renders <div frame><img/></div>; the frame is the overflow-clipped
    // box the photo is actually seen through, and the <img> inside it carries
    // the parallax transform. The morph needs both, and neither is worth a
    // prop on Photo that only this one call site would ever pass.
    const img = photoRef.current?.querySelector("img");
    const frame = img?.parentElement;
    if (!img || !frame) return;
    beginClothMorph({
      img,
      frame,
      target: `[data-cloth-target="photo-${category.slug}"]`,
      saturation: readSaturation(frame),
    });
  };

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const rawY = useTransform(scrollYProgress, [0, 1], parallaxRange);
  const y = reducedMotion ? 0 : rawY;

  const [imgFrom, imgTo] = imageParallaxRange;
  const rawImgY = useTransform(scrollYProgress, [0, 1], [`${imgFrom}%`, `${imgTo}%`]);
  const imgY = reducedMotion ? undefined : rawImgY;
  // Must cover the translate range so the drift never uncovers the frame's
  // edges: a translate of X% needs (scale - 1) / 2 >= X / 100 of headroom
  // on each side. The 0.04 pads that margin so a fractional-pixel scroll
  // position never exposes a sliver of the frame's background.
  const imgScale = reducedMotion
    ? undefined
    : 1 + (Math.max(Math.abs(imgFrom), Math.abs(imgTo)) / 100) * 2 + 0.04;

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
          onPointerEnter={() => {
            setHovered(true);
            // Compile the shader while the pointer is still travelling, so the
            // click itself only has to issue a draw call.
            prewarmClothMorph();
          }}
          onPointerLeave={() => setHovered(false)}
        >
          <Link
            href={`/work/${category.slug}`}
            data-cursor="view"
            className="group block"
            onClick={handOffToCloth}
          >
            <ViewTransition name={`photo-${category.slug}`} share="morph" default="none">
              <motion.div
                ref={photoRef}
                animate={{ scale: hovered ? 1.04 : 1 }}
                transition={{ duration: 0.6, ease: ease.inOutQuart }}
              >
                <Photo
                  photo={category.cover}
                  sizes={tileSizes(GRID_TILE[category.cover.orientation])}
                  grayscale={!hovered}
                  style={{ borderRadius: 2 }}
                  imgY={imgY}
                  imgScale={imgScale}
                />
              </motion.div>
            </ViewTransition>
            <ViewTransition name={`title-${category.slug}`} share="title-morph" default="none">
              <span
                className="font-display block text-[var(--step-1)]"
                style={{ marginTop: "0.9rem" }}
              >
                {category.caption}
              </span>
            </ViewTransition>
          </Link>
        </motion.div>
      </ScrollTilt>
    </div>
  );
}
