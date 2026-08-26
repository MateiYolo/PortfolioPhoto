import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Which side of an element a pointer was over as it crossed the boundary.
 *
 * Read on both enter and leave, which is the point of it: a hover effect
 * can then start from the side the cursor came in on and retreat out the
 * side it left by — the booking pill's ink fill
 * (components/AvailabilityBadge.tsx) and the menu links' underline
 * (components/NavMenu.tsx) both do exactly that. It is what replaced the
 * magnetic pull those two used to answer the cursor with: same
 * information, but spent on something that lands somewhere definite
 * instead of following every twitch of the pointer.
 *
 * A pointer leaving through the top or bottom edge resolves to whichever
 * half it was last over, which is where the eye is anyway.
 *
 * Both effects that use this change direction by writing a value that is
 * *not* animated (a clip-path the fill jumps to, a transform-origin), and
 * only while the thing being directed is at rest — parked off one edge,
 * or fully covering. At either of those the change cannot be seen. Catch
 * one mid-flight and it keeps its old direction rather than flipping
 * visibly.
 */
export type Edge = "left" | "right";

export function edgeOf(e: ReactPointerEvent<HTMLElement>): Edge {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientX < rect.left + rect.width / 2 ? "left" : "right";
}
