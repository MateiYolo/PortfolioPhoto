"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef, ViewTransition } from "react";
import { LoopVideo } from "@/components/LoopVideo";
import { Photo } from "@/components/Photo";
import { ScrollTilt } from "@/components/ScrollTilt";
import { clothMorphToCategory, prewarmClothMorph } from "@/lib/clothMorph";
import type { Category } from "@/lib/content";
import { yearOf } from "@/lib/date";
import { GRID_TILE, tileSizes } from "@/lib/imageSizes";
import { ease } from "@/lib/motion";
import { useEdgeHover } from "@/lib/useEdgeHover";
import { useCanHover } from "@/lib/useMediaQuery";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * The rule under the photo, using the pill's two curves for the same reason
 * (see FILL/DRAIN in components/AvailabilityBadge.tsx): arriving is the half
 * worth watching, leaving is housekeeping.
 */
const RULE = {
  in: { duration: 0.44, ease: ease.sweep },
  out: { duration: 0.3, ease: ease.outExpo },
};

/** Grey type darkening to ink as a tile takes the pointer. */
const INK_FADE = "color 0.4s var(--ease-out-expo)";

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
 * Underneath it, the caption is set as an index entry rather than a label:
 * a rule across the tile's width, the number and the year on the quiet row
 * above, the caption itself and an arrow on the row below, the four of them
 * squared off against the photo's own edges. Type sitting loose under a
 * photograph reads as a filename; the same words held between a rule and the
 * frame they belong to read as a caption, which is what they are. It is also
 * the only place the grid says anything beyond the picture — the number says
 * where you are in the archive, the year says when, and that is the whole of
 * it. Still no photo counts and no equipment: the grid is a list of places to
 * go, and the set's own page is where it explains itself.
 */
export function CategoryTile({
  category,
  index,
  parallaxRange,
}: {
  category: Category;
  /** Position in the grid, printed as the index number. 1-based. */
  index: number;
  parallaxRange: [number, number];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const canHover = useCanHover();

  /**
   * One hover state for the whole tile, carrying the edge the pointer
   * crossed by so the rule can fill from the side the cursor came in on —
   * the same information, and the same answer, as the booking pill and the
   * menu links (lib/pointerEdge.ts). Focus counts as hover here, which is
   * what gives a keyboard the colour, the rule and the wigglegram too.
   */
  const edge = useEdgeHover();
  const hovered = edge.hovered;

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

  const year = yearOf(category.date);
  const metaColor = hovered ? "var(--color-ink)" : "var(--color-grey-500)";
  const stroke = hovered ? RULE.in : RULE.out;

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
          onPointerEnter={(e) => {
            edge.onPointerEnter(e);
            // Compile the shader while the pointer is still travelling, so the
            // click itself only has to issue a draw call.
            prewarmClothMorph();
          }}
          onPointerLeave={edge.onPointerLeave}
        >
          <Link
            href={`/work/${category.slug}`}
            data-cursor="view"
            className="group block"
            onClick={handOffToCloth}
            onFocus={edge.onFocus}
            onBlur={edge.onBlur}
          >
            <ViewTransition name={`photo-${category.slug}`} share="morph" default="none">
              {/* No scale on hover any more: the pointer presses a dome into
                  the photograph instead (lib/photoWaveGl.ts), which answers
                  where the pointer actually is rather than treating the whole
                  tile as one object. Where that cannot run — no WebGL2, less
                  motion asked for, a wigglegram cover — the grey-to-colour
                  ramp below is the hover affordance, as it always was. */}
              <div
                ref={photoRef}
                // How the flight home finds the tile it is landing on.
                data-cloth-tile={`photo-${category.slug}`}
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
                  waveHover={canHover}
                >
                  {category.cover.video && (
                    <LoopVideo
                      clip={category.cover.video}
                      active={canHover ? hovered : true}
                    />
                  )}
                </Photo>
              </div>
            </ViewTransition>

            <div className="tile-caption">
              <span className="tile-caption-rule" aria-hidden>
                <motion.span
                  className="tile-caption-rule-ink"
                  style={{ transformOrigin: edge.origin }}
                  initial={false}
                  animate={{ scaleX: hovered ? 1 : 0 }}
                  transition={{
                    duration: reducedMotion ? 0.01 : stroke.duration,
                    ease: stroke.ease,
                  }}
                  // The edge only changes while the rule is at rest, so a
                  // pointer crossing back mid-sweep never flips it visibly
                  // (see lib/useEdgeHover.ts).
                  onAnimationStart={edge.onSweepStart}
                  onAnimationComplete={edge.onSweepEnd}
                />
              </span>

              <span
                className="tile-caption-index font-sans"
                style={{ color: metaColor, transition: INK_FADE }}
              >
                {String(index).padStart(2, "0")}
              </span>
              {/* Rendered only when there is one to print: a meta.md with no
                  date should leave the corner empty rather than a stray dash. */}
              {year && (
                <span
                  className="tile-caption-year font-sans"
                  style={{ color: metaColor, transition: INK_FADE }}
                >
                  {year}
                </span>
              )}

              <ViewTransition name={`title-${category.slug}`} share="title-morph" default="none">
                <span className="tile-caption-title font-display">
                  {category.caption}
                </span>
              </ViewTransition>

              {/* The one piece of the row that is pure affordance, so it is
                  the one piece that moves: it leans the way the click goes.
                  Hidden from the reader — the link's own text already says
                  where this leads. */}
              <motion.span
                className="tile-caption-arrow"
                aria-hidden
                style={{ color: metaColor, transition: INK_FADE }}
                initial={false}
                animate={{ x: hovered ? 4 : 0, y: hovered ? -4 : 0 }}
                transition={{
                  duration: reducedMotion ? 0.01 : 0.44,
                  ease: ease.outExpo,
                }}
              >
                ↗
              </motion.span>
            </div>
          </Link>
        </motion.div>
      </ScrollTilt>
    </div>
  );
}
