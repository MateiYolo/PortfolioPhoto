"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { MagneticLink } from "@/components/MagneticLink";
import { duration, ease } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

const LABEL = "Available for concerts & festivals";

/**
 * The booking status pill above the homepage title.
 *
 * Three things happen here, in the site's existing vocabulary rather than
 * as a new set of effects:
 *
 *  - a live dot that breathes a ring outwards, the only thing on the page
 *    that moves on its own, so the pill reads as a current status rather
 *    than a decoration;
 *  - an ink fill that wipes in from the left on hover — the same
 *    left-to-right clip-path wipe as <Reveal>, turned sideways — with a
 *    second copy of the label riding the identical clip in paper, so the
 *    type inverts exactly as the fill passes under it rather than
 *    switching colour on its own clock;
 *  - the arrow leaves through the top-right corner and its replacement
 *    arrives from the bottom-left.
 *
 * Monochrome on purpose: no green "available" dot. The only colour on this
 * site is the photographs (see the token block in globals.css).
 */
export function AvailabilityBadge({ email }: { email: string }) {
  const [active, setActive] = useState(false);
  const reducedMotion = useReducedMotion();

  // Focus drives the same state as hover, so a keyboard visitor gets the
  // fill and the arrow rather than just an outline.
  const on = () => setActive(true);
  const off = () => setActive(false);

  const sweep = {
    duration: reducedMotion ? 0.01 : duration.base,
    ease: ease.inOutQuart,
  };

  return (
    <MagneticLink strength={0.25} className="w-fit max-w-full">
      <a
        href={`mailto:${email}?subject=${encodeURIComponent(
          "Shooting a concert / festival"
        )}`}
        data-cursor="book"
        className="availability-badge font-sans"
        onPointerEnter={on}
        onPointerLeave={off}
        onFocus={on}
        onBlur={off}
        style={{
          position: "relative",
          display: "inline-block",
          maxWidth: "100%",
          borderRadius: 9999,
          border: "1px solid var(--color-grey-300)",
          overflow: "hidden",
          isolation: "isolate",
        }}
      >
        <BadgeContent active={active} reducedMotion={reducedMotion} />

        {/* The inverted copy: same box, same content, clipped to the fill. */}
        <motion.span
          aria-hidden
          initial={false}
          animate={{ clipPath: active ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)" }}
          transition={sweep}
          style={{
            position: "absolute",
            inset: 0,
            display: "block",
            background: "var(--color-ink)",
            color: "var(--color-paper)",
            // The pill's own radius is on the parent, which clips this
            // layer; keeping the corners here too stops a hairline of ink
            // showing outside the border on subpixel rounding.
            borderRadius: 9999,
          }}
        >
          <BadgeContent active={active} reducedMotion={reducedMotion} />
        </motion.span>
      </a>
    </MagneticLink>
  );
}

function BadgeContent({
  active,
  reducedMotion,
}: {
  active: boolean;
  reducedMotion: boolean;
}) {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6em",
        padding: "0.62em 1.15em",
        whiteSpace: "normal",
      }}
    >
      <LiveDot reducedMotion={reducedMotion} />
      <span style={{ textTransform: "uppercase" }}>{LABEL}</span>
      <ArrowSwap active={active} reducedMotion={reducedMotion} />
    </span>
  );
}

/** Ink dot with a ring breathing out of it. */
function LiveDot({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        flex: "none",
        width: "0.55em",
        height: "0.55em",
      }}
    >
      {!reducedMotion && (
        <motion.span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 9999,
            border: "1px solid currentColor",
          }}
          animate={{ scale: [1, 2.8], opacity: [0.5, 0] }}
          transition={{
            duration: 2.2,
            ease: "easeOut",
            repeat: Infinity,
            repeatDelay: 0.5,
          }}
        />
      )}
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 9999,
          background: "currentColor",
        }}
      />
    </span>
  );
}

/**
 * One arrow leaves through the top-right corner while its twin arrives
 * from the bottom-left, along the arrow's own diagonal.
 */
function ArrowSwap({
  active,
  reducedMotion,
}: {
  active: boolean;
  reducedMotion: boolean;
}) {
  const transition = {
    duration: reducedMotion ? 0.01 : 0.5,
    ease: ease.outExpo,
  };

  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        flex: "none",
        width: "0.7em",
        height: "0.7em",
        overflow: "hidden",
      }}
    >
      <motion.span
        style={{ position: "absolute", inset: 0 }}
        initial={false}
        animate={{ x: active ? "115%" : "0%", y: active ? "-115%" : "0%" }}
        transition={transition}
      >
        <Arrow />
      </motion.span>
      <motion.span
        style={{ position: "absolute", inset: 0 }}
        initial={false}
        animate={{ x: active ? "0%" : "-115%", y: active ? "0%" : "115%" }}
        transition={transition}
      >
        <Arrow />
      </motion.span>
    </span>
  );
}

function Arrow() {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      <path
        d="M2.5 9.5 9.5 2.5M9.5 2.5H4.2M9.5 2.5V7.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
