"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef, useState } from "react";
import { type Edge, edgeOf } from "@/lib/pointerEdge";

/**
 * Hover state plus which edge the pointer last crossed by, for
 * <HoverUnderline>. The direction only changes while the underline is at
 * rest (see lib/pointerEdge.ts for why), so a change mid-sweep never
 * flips it visibly — that's what settled (exposed as onSweepStart /
 * onSweepEnd, meant for the underline's onAnimationStart / onComplete)
 * guards against.
 *
 * Spread the returned pointer/focus handlers onto the interactive element
 * itself (a Link, an anchor, a button) rather than an extra wrapping span:
 * one fewer layer, and the hit area stays exactly what it already was.
 */
export function useEdgeHover() {
  const [hovered, setHovered] = useState(false);
  const [origin, setOrigin] = useState<Edge>("left");
  const settled = useRef(true);

  const turn = (e: ReactPointerEvent<HTMLElement>) => {
    if (settled.current) setOrigin(edgeOf(e));
  };

  return {
    hovered,
    origin,
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => {
      turn(e);
      setHovered(true);
    },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
      turn(e);
      setHovered(false);
    },
    onFocus: () => setHovered(true),
    onBlur: () => setHovered(false),
    onSweepStart: () => {
      settled.current = false;
    },
    onSweepEnd: () => {
      settled.current = true;
    },
  };
}
