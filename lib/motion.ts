/**
 * Single source of truth for animation timing. Every component pulls from
 * here instead of hard-coding durations/easings, so the whole site reads as
 * one designed object rather than a pile of unrelated effects.
 *
 * Keep the numeric values in sync with the CSS custom properties in
 * app/globals.css (--ease-*, --duration-base): those drive the native
 * View Transition, these drive everything Motion animates directly.
 */

export const ease = {
  /** Primary easing for reveals, hovers, and most transforms. */
  inOutQuart: [0.65, 0, 0.35, 1] as const,
  /** Snappier out-easing for things that should feel like they "arrive". */
  outExpo: [0.16, 1, 0.3, 1] as const,
  /**
   * For a single edge travelling across something — the booking pill's
   * ink fill. Neither of the two above is right for a sweep. outExpo is
   * 53% across by 50ms and 79% by 100ms: the motion is over before the
   * eye has found it, which is why a fill on it reads as a state that
   * simply changed rather than one that moved. Textbook in-out curves
   * overcorrect — inOutQuint is 3% along at 100ms, and a hover that
   * shows nothing for an eighth of a second is lag, however good the
   * middle looks. This is the shape between them: ~10% by 100ms, so the
   * answer starts the moment the cursor lands; a hard acceleration
   * through the middle third, which is the part that reads as one
   * deliberate pass; then a long settle onto the far edge.
   */
  sweep: [0.55, 0, 0.15, 1] as const,
};

export const duration = {
  base: 0.6,
  fast: 0.35,
  slow: 0.9,
};

export const stagger = {
  chars: 0.03,
  lines: 0.08,
  tiles: 0.08,
};

/** Spring used for cursor-follow and magnetic-hover translations. */
export const magneticSpring = { stiffness: 150, damping: 15, mass: 0.1 };

/**
 * Spring for press feedback: an element compressing under the pointer and
 * springing back. Stiff and well damped on purpose — a press is a
 * confirmation, not a bounce, so it settles before the finger is up.
 */
export const pressSpring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 32,
  mass: 0.6,
};

/** Spring used for the lagging cursor ring. */
export const cursorRingSpring = { stiffness: 300, damping: 30, mass: 0.5 };

/** Shared mask-wipe reveal, used by <Reveal> and any bespoke clip-paths. */
export const wipeReveal = {
  hidden: { clipPath: "inset(100% 0 0 0)" },
  visible: {
    clipPath: "inset(0% 0 0 0)",
    transition: { duration: duration.slow, ease: ease.inOutQuart },
  },
};

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.base, ease: ease.inOutQuart },
  },
};
