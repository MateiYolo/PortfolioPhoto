"use client";

import { useSyncExternalStore } from "react";

/**
 * One MediaQueryList per query for the whole app, so a hundred tiles asking
 * the same question of the browser cost one listener, not a hundred.
 */
const queries = new Map<string, MediaQueryList>();

function getQuery(query: string): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  let mq = queries.get(query);
  if (!mq) {
    mq = window.matchMedia(query);
    queries.set(query, mq);
  }
  return mq;
}

/**
 * A media query as a live React value, in the shape of
 * lib/useReducedMotion.ts (which predates this and stays as it is: it is
 * the one query every animation in the app gates on, and it reads better
 * named after what it means than after how it is asked).
 *
 * Server render answers `false`, so a query has to be written such that
 * false is the safe half of the answer: `(hover: hover)` treats a first
 * paint as touch and asks for hover only once the client agrees.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = getQuery(query);
      if (!mq) return () => {};
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => getQuery(query)?.matches ?? false,
    () => false
  );
}

/**
 * Whether the visitor has a pointer that can hover at all. Hover-only
 * behaviour is unreachable on a phone, so anything hung off it needs
 * something else to happen there instead.
 */
export function useCanHover(): boolean {
  return useMediaQuery("(hover: hover) and (pointer: fine)");
}
