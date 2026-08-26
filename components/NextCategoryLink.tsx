"use client";

import Link from "next/link";
import { HoverUnderline } from "@/components/HoverUnderline";
import { useEdgeHover } from "@/lib/useEdgeHover";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * The "next category" link that closes out a category page. Used to sit
 * inside <MagneticLink>, nudging the whole title toward the cursor; on a
 * block this size that read as the title itself glitching, not as a hover
 * state (see AvailabilityBadge's note on the same trade-off). The
 * underline it grows now is the site's standard answer instead.
 */
export function NextCategoryLink({ slug, title }: { slug: string; title: string }) {
  const reducedMotion = useReducedMotion();
  const edge = useEdgeHover();

  return (
    <Link
      href={`/work/${slug}`}
      data-cursor="view"
      className="group relative inline-block"
      onPointerEnter={edge.onPointerEnter}
      onPointerLeave={edge.onPointerLeave}
      onFocus={edge.onFocus}
      onBlur={edge.onBlur}
    >
      <span className="font-sans text-grey-500 text-[var(--step--1)] uppercase tracking-[0.2em]">
        Next category
      </span>
      <span
        className="font-display block"
        style={{ fontSize: "var(--step-3)", marginTop: "0.5rem" }}
      >
        {title}
      </span>
      <HoverUnderline
        hovered={edge.hovered}
        origin={edge.origin}
        reducedMotion={reducedMotion}
        onSweepStart={edge.onSweepStart}
        onSweepEnd={edge.onSweepEnd}
      />
    </Link>
  );
}
