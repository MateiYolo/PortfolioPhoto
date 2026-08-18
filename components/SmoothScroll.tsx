"use client";

import { ReactLenis } from "lenis/react";
import type { ReactNode } from "react";

/**
 * Global smooth-scroll provider. Lenis takes over the native scroll and
 * drives it with inertia; because it updates real window scroll position
 * (root mode), Motion's own `useScroll` hooks stay in sync automatically —
 * no manual bridging needed.
 *
 * Reduced motion is Lenis's own job (`respectReducedMotion`, on by default):
 * it forces lerp to 1 so scrolling tracks the input device exactly. Gating
 * this component on our own media query instead would mean unmounting the
 * provider one tick after hydration, which remounts the entire page —
 * every <img> included — and throws away work the browser just did.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis
      root
      options={{
        // lerp and duration are two alternative smoothing models; passing
        // both leaves which one applies up to Lenis internals. Wheel
        // smoothing is what this site wants, so: lerp only.
        lerp: 0.1,
        wheelMultiplier: 1,
        touchMultiplier: 1.5,
        syncTouch: false,
      }}
    >
      {children}
    </ReactLenis>
  );
}
