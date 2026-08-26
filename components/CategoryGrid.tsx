"use client";

import { useEffect } from "react";
import { CategoryTile } from "@/components/CategoryTile";
import { prewarmClothMorphWhenIdle } from "@/lib/clothMorph";
import type { Category } from "@/lib/content";
import { GRID_TILE, tileWidth } from "@/lib/imageSizes";

const ALIGN_PATTERN: Array<"flex-start" | "flex-end" | "center"> = [
  "flex-start",
  "flex-end",
  "flex-end",
  "flex-start",
  "center",
];

const OFFSET_PATTERN = ["0rem", "4.5rem", "1.5rem", "5.5rem", "2.5rem"];

const PARALLAX_PATTERN: Array<[number, number]> = [
  [-30, 30],
  [24, -24],
  [-18, 18],
];

/**
 * How far the photo drifts *inside* its own frame as it crosses the
 * viewport, in percent of the frame's height — independent of, and on top
 * of, the whole-tile drift above. This is what reads as the image itself
 * scrolling slower/faster than its frame, the classic parallax-in-a-mask
 * effect. Alternating sign against PARALLAX_PATTERN (rather than mirroring
 * it) is what keeps the grid from reading like everything is pinned to one
 * shared rate.
 */
const IMAGE_PARALLAX_PATTERN: Array<[number, number]> = [
  [-9, 9],
  [7, -7],
  [-6, 6],
];

/**
 * Homepage grid: a vertical stack of full-bleed rows whose individual tile
 * gets a width (by cover orientation) and an alignment/offset (by a fixed
 * cycling pattern) so the composition reads as hand-arranged rather than a
 * uniform gallery grid: the "editorial asymmetric" layout from the brief.
 */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  // A tile also warms this on pointer enter, which covers a mouse. Touch has
  // no hover to warm from — pointerenter arrives with the tap itself — so the
  // shader is fetched on idle as well, once the photos have had first claim
  // on the network.
  useEffect(prewarmClothMorphWhenIdle, []);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {categories.map((category, i) => (
        <div
          key={category.slug}
          className="category-row"
          style={
            {
              "--tile-align": ALIGN_PATTERN[i % ALIGN_PATTERN.length],
              "--tile-offset": i === 0 ? "0rem" : OFFSET_PATTERN[i % OFFSET_PATTERN.length],
              marginBottom: "var(--gutter)",
              paddingLeft: "var(--gutter)",
              paddingRight: "var(--gutter)",
            } as React.CSSProperties
          }
        >
          <div
            className="category-tile-frame"
            style={
              {
                "--tile-width": tileWidth(GRID_TILE[category.cover.orientation]),
              } as React.CSSProperties
            }
          >
            <CategoryTile
              category={category}
              parallaxRange={PARALLAX_PATTERN[i % PARALLAX_PATTERN.length]}
              imageParallaxRange={
                IMAGE_PARALLAX_PATTERN[i % IMAGE_PARALLAX_PATTERN.length]
              }
            />
          </div>
        </div>
      ))}
    </div>
  );
}
