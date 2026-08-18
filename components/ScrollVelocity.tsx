"use client";

import {
  motionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import type { MotionValue } from "motion/react";
import { createContext, useContext } from "react";
import type { ReactNode } from "react";

/** Scroll speed, in px/s, at which the effect is considered maxed out. */
const FULL_TILT_SPEED = 2600;

/**
 * One page-wide reading of how hard the visitor is scrolling, normalised
 * to -1 (flat out upwards) .. 0 (still) .. 1 (flat out downwards).
 *
 * Raw scroll velocity is far too twitchy to drive a transform: it spikes
 * on the first wheel notch and drops to zero between them. The spring is
 * what makes it usable, and what makes the result feel physical rather
 * than reactive.
 *
 * Two details decide whether that reads as weight or as lag. The velocity
 * is normalised *before* it is smoothed, so the spring works over -1..1
 * where its constants mean what they say and its rest threshold is
 * meaningful; springing raw px/s first would leave it grinding away long
 * after the motion was invisible. And the constants themselves sit just
 * the far side of critical damping (zeta about 1.09, settling in roughly
 * a fifth of a second): fast enough to track the hand, damped enough
 * never to wobble.
 *
 * It lives in context so the whole page shares a single spring. Fifteen
 * photos each running their own would be fifteen frame loops computing
 * the same number, and any drift between them would break the illusion
 * that they are all being moved by the same force.
 */
const STILL = motionValue(0);
const ScrollVelocityContext = createContext<MotionValue<number>>(STILL);

export function ScrollVelocityProvider({ children }: { children: ReactNode }) {
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const normalised = useTransform(
    velocity,
    [-FULL_TILT_SPEED, 0, FULL_TILT_SPEED],
    [-1, 0, 1],
    { clamp: true }
  );
  const smoothed = useSpring(normalised, {
    stiffness: 320,
    damping: 22,
    mass: 0.32,
    restDelta: 0.0005,
  });

  return (
    <ScrollVelocityContext.Provider value={smoothed}>
      {children}
    </ScrollVelocityContext.Provider>
  );
}

/**
 * Returns a value that is 0 whenever the page is at rest, so anything
 * reading it is free to add its own resting state on top without having
 * to know whether a provider is mounted above it.
 */
export function useScrollVelocityFactor() {
  return useContext(ScrollVelocityContext);
}
