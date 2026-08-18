"use client";

import { useEffect, useState } from "react";

/**
 * Tracks prefers-reduced-motion live (not just at mount), so a user who
 * flips the OS setting mid-session gets an immediate, correct response.
 * Every hand-rolled animation in this app should gate on this. The CSS
 * fallback in globals.css only catches CSS-driven animation, not
 * Motion/JS-driven transforms.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return reduced;
}
