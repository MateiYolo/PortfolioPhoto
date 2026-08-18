"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

let mediaQuery: MediaQueryList | null = null;

function getMediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  mediaQuery ??= window.matchMedia(QUERY);
  return mediaQuery;
}

function subscribe(onChange: () => void): () => void {
  const query = getMediaQuery();
  if (!query) return () => {};
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return getMediaQuery()?.matches ?? false;
}

/** The server has no media queries; motion is assumed until proven otherwise. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Tracks prefers-reduced-motion live (not just at mount), so a user who
 * flips the OS setting mid-session gets an immediate, correct response.
 * Every hand-rolled animation in this app should gate on this — the CSS
 * fallback in globals.css only catches CSS-driven animation, not
 * Motion/JS-driven transforms.
 *
 * Backed by useSyncExternalStore rather than useState + useEffect so the
 * correct value is available on the first client render, instead of one
 * render later. A one-tick-late `true` is not just a cosmetic flash: any
 * component that branches on it would mount its motion tree and then
 * immediately tear it down. Callers should still prefer collapsing
 * durations over changing the shape of the tree.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
