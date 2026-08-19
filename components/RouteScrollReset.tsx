"use client";

import { useLenis } from "lenis/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { clothMorphLanding } from "@/lib/clothMorph";

/**
 * Next's own scroll-to-top-on-navigate calls the native `window.scrollTo`,
 * but Lenis (see SmoothScroll) owns the root scroll position and drives it
 * from its own animated value, so that native call gets overwritten on
 * Lenis's next tick. Without this, landing on a new page keeps whatever
 * scroll position the homepage was left at.
 *
 * The one exception is a photo flying home to its tile in the grid, which
 * needs to land somewhere it can be seen — see clothMorphLanding for why the
 * top of the page is not that place. Nothing else can ask; every other
 * navigation, and every browser that cannot run the effect, still starts at
 * the top exactly as before.
 */
export function RouteScrollReset() {
  const pathname = usePathname();
  const lenis = useLenis();

  useEffect(() => {
    lenis?.scrollTo(clothMorphLanding() ?? 0, { immediate: true });
  }, [pathname, lenis]);

  return null;
}
