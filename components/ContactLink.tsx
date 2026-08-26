"use client";

import { HoverUnderline } from "@/components/HoverUnderline";
import { useEdgeHover } from "@/lib/useEdgeHover";
import { useReducedMotion } from "@/lib/useReducedMotion";

/** One entry in the about page's contact list. See NextCategoryLink for
 * why this grows an underline rather than nudging toward the cursor. */
export function ContactLink({ href, label }: { href: string; label: string }) {
  const reducedMotion = useReducedMotion();
  const edge = useEdgeHover();
  const external = href.startsWith("http");

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="relative inline-block font-sans text-[var(--step--1)] uppercase tracking-[0.15em] text-grey-500"
      data-cursor="visit"
      onPointerEnter={edge.onPointerEnter}
      onPointerLeave={edge.onPointerLeave}
      onFocus={edge.onFocus}
      onBlur={edge.onBlur}
    >
      {label}
      <HoverUnderline
        hovered={edge.hovered}
        origin={edge.origin}
        reducedMotion={reducedMotion}
        onSweepStart={edge.onSweepStart}
        onSweepEnd={edge.onSweepEnd}
      />
    </a>
  );
}
