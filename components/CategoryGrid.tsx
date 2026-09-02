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
 * Homepage grid: a vertical stack of full-bleed rows whose individual tile
 * gets a width (by cover orientation) and an alignment/offset (by a fixed
 * cycling pattern) so the composition reads as hand-arranged rather than a
 * uniform gallery grid: the "editorial asymmetric" layout from the brief.
 *
 * Position in that stack is also the number each tile prints in its caption
 * (components/CategoryTile.tsx), which is why it is passed rather than read:
 * the order is this component's, decided by `order:` in each meta.md, and a
 * tile has no way to know where it landed.
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
              index={i + 1}
              parallaxRange={PARALLAX_PATTERN[i % PARALLAX_PATTERN.length]}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
