"use client";

import { useLenis } from "lenis/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Next's own scroll-to-top-on-navigate calls the native `window.scrollTo`,
 * but Lenis (see SmoothScroll) owns the root scroll position and drives it
 * from its own animated value, so that native call gets overwritten on
 * Lenis's next tick. Without this, landing on a new page keeps whatever
 * scroll position the homepage was left at.
 */
export function RouteScrollReset() {
  const pathname = usePathname();
  const lenis = useLenis();

  useEffect(() => {
    lenis?.scrollTo(0, { immediate: true });
  }, [pathname, lenis]);

  return null;
}
