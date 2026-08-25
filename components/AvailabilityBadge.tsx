"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { MagneticLink } from "@/components/MagneticLink";
import { duration, ease } from "@/lib/motion";
import { useReducedMotion } from "@/lib/useReducedMotion";

const LABEL = "Available for concerts & festivals";
const COPIED = "Email copied to clipboard";

/** How long the confirmation stays up before the label rolls back. */
const COPIED_MS = 2200;
/** Longer when the copy failed: the address itself is on screen to read. */
const FAILED_MS = 6000;

/**
 * The booking pill in the fixed header, where the wordmark used to sit.
 *
 * Clicking copies the address rather than opening a mail client — most
 * visitors are not one click from a configured desktop client, and the
 * ones who are can still paste. The label rolls up to confirm, the same
 * roll the email on the About page uses (components/ContactEmail.tsx).
 *
 * Three things move here, in the site's existing vocabulary rather than as
 * a new set of effects:
 *
 *  - a live dot that breathes a ring outwards, the only thing on the page
 *    that moves on its own, so the pill reads as a current status rather
 *    than a decoration;
 *  - an ink fill that wipes in from the left on hover — the same
 *    left-to-right clip-path wipe as <Reveal>, turned sideways — with a
 *    second copy of the label riding the identical clip in paper, so the
 *    type inverts exactly as the fill passes under it rather than
 *    switching colour on its own clock;
 *  - the copy icon swaps for a tick the moment the address lands,
 *    leaving through the top of its slot as the tick arrives from
 *    underneath, and rolls back the same way once the confirmation clears.
 *
 * Monochrome on purpose: no green "available" dot. The only colour on this
 * site is the photographs (see the token block in globals.css).
 */
export function AvailabilityBadge({ email }: { email: string }) {
  const [hovered, setHovered] = useState(false);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const reducedMotion = useReducedMotion();
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const handleClick = async () => {
    const ok = await copyToClipboard(email);
    setState(ok ? "copied" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setState("idle"),
      ok ? COPIED_MS : FAILED_MS
    );
  };

  // Confirming counts as active even when the pointer is elsewhere, so a
  // keyboard copy fills the pill too.
  const active = hovered || state !== "idle";
  const content = {
    active,
    state,
    email,
    reducedMotion,
  };

  return (
    <MagneticLink strength={0.25} className="w-fit max-w-full">
      <button
        type="button"
        onClick={handleClick}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        data-cursor="copy"
        // The visible label opens the accessible name, so the name still
        // contains it (WCAG 2.5.3) while saying what the button does.
        aria-label={`${LABEL} — click to copy ${email}`}
        className="availability-badge font-sans"
        style={{
          position: "relative",
          display: "inline-block",
          maxWidth: "100%",
          borderRadius: 9999,
          border: "1px solid var(--color-grey-300)",
          // Opaque on purpose: this sits in the fixed header, so photos
          // scroll underneath it. The About link opposite can lean on
          // mix-blend-mode instead because it is bare type; a pill with a
          // fill cannot (see components/NavHeader.tsx).
          background: "var(--color-paper)",
          color: "var(--color-ink)",
          overflow: "hidden",
          isolation: "isolate",
        }}
      >
        <BadgeContent {...content} />

        {/* The inverted copy: same box, same content, clipped to the fill. */}
        <motion.span
          aria-hidden
          initial={false}
          animate={{ clipPath: active ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)" }}
          transition={{
            duration: reducedMotion ? 0.01 : duration.base,
            ease: ease.inOutQuart,
          }}
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
          <BadgeContent {...content} />
        </motion.span>

        {/* Announced, not shown: the roll-up is the sighted confirmation. */}
        <span
          aria-live="polite"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clipPath: "inset(50%)",
            whiteSpace: "nowrap",
          }}
        >
          {state === "copied" ? COPIED : state === "failed" ? email : ""}
        </span>
      </button>
    </MagneticLink>
  );
}

/** Clipboard API where it exists, the old selection trick where it doesn't. */
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Not a secure context, or permission refused. Fall through.
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.cssText = "position:fixed;top:0;opacity:0;pointer-events:none";
    document.body.append(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  } catch {
    // Nothing left to try: the caller shows the address instead.
    return false;
  }
}

type ContentProps = {
  active: boolean;
  state: "idle" | "copied" | "failed";
  email: string;
  reducedMotion: boolean;
};

function BadgeContent({ active, state, email, reducedMotion }: ContentProps) {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6em",
        // Shared with the About link opposite, so the two header
        // items come out the same height (see globals.css).
        padding: "var(--nav-pad-y) 1.15em",
      }}
    >
      <LiveDot reducedMotion={reducedMotion} />
      <RollingLabel state={state} email={email} reducedMotion={reducedMotion} />
      <IconSwap copied={state === "copied"} reducedMotion={reducedMotion} />
    </span>
  );
}

/**
 * The label and its confirmation stacked in a one-line window; copying
 * rolls the stack up by exactly one row.
 *
 * Both rows are always rendered, so the pill is as wide as the widest of
 * them and never resizes mid-roll. --nav-row is that row height, shared
 * with the About link so the two header items stay the same height.
 */
function RollingLabel({
  state,
  email,
  reducedMotion,
}: {
  state: ContentProps["state"];
  email: string;
  reducedMotion: boolean;
}) {
  return (
    <span
      style={{
        display: "block",
        height: "var(--nav-row)",
        overflow: "hidden",
        // Left-aligned: the confirmation is shorter than the label, and
        // centring it would read as the text sliding sideways as well.
        textAlign: "left",
      }}
    >
      <motion.span
        style={{ display: "block" }}
        initial={false}
        animate={{ y: state === "idle" ? "0%" : "-50%" }}
        transition={{
          duration: reducedMotion ? 0.01 : 0.45,
          ease: ease.inOutQuart,
        }}
      >
        <Row>{LABEL}</Row>
        {/* No clipboard: the address itself, to read or select by hand. */}
        <Row>{state === "failed" ? email : COPIED}</Row>
      </motion.span>
    </span>
  );
}

function Row({ children }: { children: string }) {
  return (
    <span
      style={{
        display: "block",
        height: "var(--nav-row)",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
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
 * The copy icon leaves through the top of its slot as a tick arrives from
 * underneath, and the pair rolls back the same way once the confirmation
 * clears. Driven only by whether the copy landed — hover has no opinion
 * here, that's the ink fill and the label roll's job.
 */
function IconSwap({
  copied,
  reducedMotion,
}: {
  copied: boolean;
  reducedMotion: boolean;
}) {
  const transition = {
    duration: reducedMotion ? 0.01 : 0.45,
    ease: ease.outExpo,
  };

  return (
    <span
      aria-hidden
      className="availability-badge__icon"
      style={{
        position: "relative",
        flex: "none",
        width: "0.8em",
        height: "0.8em",
        overflow: "hidden",
      }}
    >
      <motion.span
        style={{ position: "absolute", inset: 0 }}
        initial={false}
        animate={{ y: copied ? "-130%" : "0%" }}
        transition={transition}
      >
        <CopyMark />
      </motion.span>
      <motion.span
        style={{ position: "absolute", inset: 0 }}
        initial={false}
        animate={{ y: copied ? "0%" : "130%" }}
        transition={transition}
      >
        <Tick />
      </motion.span>
    </span>
  );
}

function CopyMark() {
  return (
    <Svg>
      <rect x="1.2" y="1.2" width="6.2" height="6.2" rx="1.6" />
      <path d="M4.6 10.8h4.6a1.6 1.6 0 0 0 1.6-1.6V4.6" />
    </Svg>
  );
}

function Tick() {
  return (
    <Svg>
      <path d="M1.8 6.4 4.7 9.3l5.5-6" />
    </Svg>
  );
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      {children}
    </svg>
  );
}
