"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useState } from "react";
import { Arrive } from "@/components/Arrive";
import { MagneticLink } from "@/components/MagneticLink";
import { ease } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

const LABEL = "Available for concerts & festivals";
const HOVER_LABEL = "Get in touch →";

/**
 * The availability pill at the top of the homepage: a live status line that
 * doubles as the one call to action above the fold.
 *
 * Three things move, all off the same `active` flag so hover and keyboard
 * focus produce exactly the same state:
 *
 * - a dot that keeps pulsing on its own, so the claim reads as *currently*
 *   true rather than as a line of copy someone typed once;
 * - an ink fill that rises from the bottom edge under the text (clip-path
 *   rather than scaleY: scaling a pill distorts its corner radius, clipping
 *   it doesn't);
 * - the label rolling up to the invitation underneath it, the same idiom as
 *   the email on the About page.
 *
 * Every colour inside is `currentColor`, so the dot inverts to paper along
 * with the text as the fill passes behind it, and the whole thing stays
 * monochrome like the rest of the site.
 */
export function AvailabilityBadge() {
  const reducedMotion = useReducedMotion();
  const [active, setActive] = useState(false);

  return (
    // w-fit at every level: MagneticLink measures its own box to work out
    // how far to lean, and a full-width wrapper would have the pill lurching
    // toward a pointer that is nowhere near it.
    <Arrive className="w-fit" delay={0.15}>
      <MagneticLink className="w-fit" strength={0.25}>
        <Link
          href="/about"
          data-cursor="hire"
          aria-label={`${LABEL}. ${HOVER_LABEL}`}
          onPointerEnter={() => setActive(true)}
          onPointerLeave={() => setActive(false)}
          onFocus={() => setActive(true)}
          onBlur={() => setActive(false)}
          className="font-sans relative inline-flex items-center rounded-full"
          style={{
            gap: "0.55rem",
            // The label never wraps (it rolls, so both lines have to stay on
            // one line each), which makes the pill's width the one thing that
            // can push a narrow phone into horizontal overflow. The side
            // padding gives way first, before the type does.
            padding: "0.5rem clamp(0.8rem, 2.6vw, 1rem)",
            border: "1px solid",
            borderColor: active ? "var(--color-ink)" : "var(--color-grey-300)",
            color: active ? "var(--color-paper)" : "var(--color-ink)",
            // The colour lags the fill slightly so the text never turns pale
            // over paper it hasn't been covered by yet.
            transition:
              "color 260ms var(--ease-in-out-quart) 140ms, border-color 420ms var(--ease-in-out-quart)",
          }}
        >
          <motion.span
            aria-hidden
            className="bg-ink absolute inset-0 rounded-full"
            initial={false}
            animate={{ clipPath: active ? "inset(0% 0 0 0)" : "inset(100% 0 0 0)" }}
            transition={{ duration: reducedMotion ? 0.01 : 0.55, ease: ease.outExpo }}
          />

          {/* Positioned, so it paints over the fill above rather than under
              it — DOM order decides between two positioned siblings that
              both leave z-index alone. */}
          <span
            aria-hidden
            className="relative block shrink-0 rounded-full"
            style={{ width: 7, height: 7, background: "currentColor" }}
          >
            {!reducedMotion && (
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ background: "currentColor" }}
                animate={{ scale: [1, 2.6], opacity: [0.45, 0] }}
                transition={{
                  duration: 1.9,
                  ease: "easeOut",
                  repeat: Infinity,
                  repeatDelay: 0.5,
                }}
              />
            )}
          </span>

          <span
            className="relative block overflow-hidden uppercase"
            style={{
              fontSize: "clamp(0.6rem, 0.52rem + 0.25vw, 0.72rem)",
              letterSpacing: "0.16em",
              lineHeight: 1.25,
              height: "1.25em",
              // Absorbs the trailing letter-space, which would otherwise
              // sit the pill's right padding a hair wider than its left.
              marginRight: "-0.16em",
            }}
          >
            <span
              className="block"
              style={{
                transform: active ? "translateY(-50%)" : "translateY(0)",
                transition: `transform ${reducedMotion ? 1 : 520}ms var(--ease-out-expo)`,
              }}
            >
              <span className="block whitespace-nowrap" style={{ height: "1.25em" }}>
                {LABEL}
              </span>
              <span
                aria-hidden
                className="block whitespace-nowrap"
                style={{ height: "1.25em" }}
              >
                {HOVER_LABEL}
              </span>
            </span>
          </span>
        </Link>
      </MagneticLink>
    </Arrive>
  );
}
