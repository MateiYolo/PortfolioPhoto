"use client";

import { useState } from "react";
import { CategoryTile } from "@/components/CategoryTile";
import type { Category } from "@/lib/content";

const WIDTHS: Record<Category["cover"]["orientation"], string> = {
  landscape: "clamp(20rem, 62vw, 52rem)",
  portrait: "clamp(16rem, 36vw, 30rem)",
  square: "clamp(18rem, 48vw, 38rem)",
};

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
 * Hover state lives here so hovering one tile can dim every sibling.
 */
export function CategoryGrid({ categories }: { categories: Category[] }) {
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {categories.map((category, i) => (
        <div
          key={category.slug}
          className="category-row"
          style={
            {
              "--tile-align": ALIGN_PATTERN[i % ALIGN_PATTERN.length],
              marginTop: i === 0 ? 0 : OFFSET_PATTERN[i % OFFSET_PATTERN.length],
              marginBottom: "var(--gutter)",
              paddingLeft: "var(--gutter)",
              paddingRight: "var(--gutter)",
            } as React.CSSProperties
          }
        >
          <div
            className="category-tile-frame"
            style={{ "--tile-width": WIDTHS[category.cover.orientation] } as React.CSSProperties}
          >
            <CategoryTile
              category={category}
              parallaxRange={PARALLAX_PATTERN[i % PARALLAX_PATTERN.length]}
              dimmed={hoveredSlug !== null && hoveredSlug !== category.slug}
              onHoverChange={setHoveredSlug}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
