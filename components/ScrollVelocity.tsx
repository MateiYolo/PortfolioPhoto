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
 * than reactive: force ramps in as the visitor gets going, overshoots
 * slightly when they stop, and eases back to level under its own weight.
 *
 * It lives in context so the whole page shares a single spring. Fifteen
 * photos each running their own would be fifteen frame loops computing
 * the same number, and any drift between them would break the illusion
 * that they are all being dragged by the same hand.
 */
const STILL = motionValue(0);
const ScrollVelocityContext = createContext<MotionValue<number>>(STILL);

export function ScrollVelocityProvider({ children }: { children: ReactNode }) {
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smoothed = useSpring(velocity, {
    stiffness: 170,
    damping: 34,
    mass: 0.55,
  });
  const factor = useTransform(
    smoothed,
    [-FULL_TILT_SPEED, 0, FULL_TILT_SPEED],
    [-1, 0, 1],
    { clamp: true }
  );

  return (
    <ScrollVelocityContext.Provider value={factor}>
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
