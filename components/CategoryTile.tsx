"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef, useState, ViewTransition } from "react";
import { LoopVideo } from "@/components/LoopVideo";
import { Photo } from "@/components/Photo";
import { ScrollTilt } from "@/components/ScrollTilt";
import { clothMorphToCategory, prewarmClothMorph } from "@/lib/clothMorph";
import type { Category } from "@/lib/content";
import { GRID_TILE, tileSizes } from "@/lib/imageSizes";
import { ease } from "@/lib/motion";
import { useCanHover } from "@/lib/useMediaQuery";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * One cover on the homepage grid. Hover brings colour into the (otherwise
 * grayscale) photo and scales it slightly within its frame.
 *
 * A cover that is a wigglegram starts as its still, in grey, like every
 * other tile, and starts moving under the same hover that brings the colour
 * in. Where there is no hover to wait for, it plays whenever it is on
 * screen, and stays grey while it does: the grid reads the same either way,
 * and the alternative is a tile that never moves at all on a phone.
 *
 * Only the caption is set under the photo. No counts, no metadata: the grid
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
  const photoRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedMotion();
  const canHover = useCanHover();

  /**
   * Hands the cover photo to the WebGL flag morph (lib/clothMorph.ts) and lets
   * the Link navigate underneath it. It has to happen in the click itself,
   * because a moment later this tile is unmounted and there is nothing left to
   * measure.
   *
   * Returning silently is the fallback: the <ViewTransition> below is still in
   * the markup, so a browser without WebGL2 — or a visitor who asked for less
   * motion — simply gets the native morph, which is what the site shipped with.
   */
  const handOffToCloth = () => {
    if (reducedMotion) return;
    clothMorphToCategory(category.slug, photoRef.current);
  };

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  // Whole-tile drift is desktop-only. Each row's parallaxRange runs at a
  // different rate (see PARALLAX_PATTERN in CategoryGrid.tsx), which is
  // deliberate on a mouse-driven scroll but reads as broken rhythm on a
  // touch scroll: the gap between tiles visibly stretches and shrinks as
  // you drag. The photo's own answer to the scroll is the swell inside the
  // frame (lib/photoWaveGl.ts), which every device gets because it never
  // moves the tile's box.
  const rawY = useTransform(scrollYProgress, [0, 1], parallaxRange);
  const y = reducedMotion || !canHover ? 0 : rawY;

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
                // How the flight home finds the tile it is landing on.
                data-cloth-tile={`photo-${category.slug}`}
                animate={{ scale: hovered ? 1.04 : 1 }}
                transition={{ duration: 0.6, ease: ease.inOutQuart }}
              >
                <Photo
                  photo={category.cover}
                  sizes={tileSizes(GRID_TILE[category.cover.orientation])}
                  grayscale={!hovered}
                  style={{ borderRadius: 2 }}
                  // A wigglegram cover is already moving, and the clip that
                  // provides that movement is a DOM element laid over the
                  // photo: it cannot follow the swell, so a cover that swelled
                  // underneath it would come apart. The motion is the point of
                  // those tiles anyway.
                  wave={!category.cover.video}
                >
                  {category.cover.video && (
                    <LoopVideo
                      clip={category.cover.video}
                      active={canHover ? hovered : true}
                    />
                  )}
                </Photo>
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
