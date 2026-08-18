"use client";

import { ReactLenis } from "lenis/react";
import type { ReactNode } from "react";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * Global smooth-scroll provider. Lenis takes over the native scroll and
 * drives it with inertia; because it updates real window scroll position
 * (root mode), Motion's own `useScroll` hooks stay in sync automatically —
 * no manual bridging needed.
 *
 * Fully bypassed under prefers-reduced-motion: native scroll is restored.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) return <>{children}</>;

  return (
    <ReactLenis
      root
      options={{
        lerp: 0.1,
        duration: 1.2,
        wheelMultiplier: 1,
        touchMultiplier: 1.5,
        syncTouch: false,
      }}
    >
      {children}
    </ReactLenis>
  );
}
