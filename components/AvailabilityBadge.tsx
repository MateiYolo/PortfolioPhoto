"use client";

import { animate, motion, useMotionValue } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ease, pressSpring, stagger } from "@/lib/motion";
import { type Edge, edgeOf } from "@/lib/pointerEdge";
import { useReducedMotion } from "@/lib/useReducedMotion";

/** The idle label cycles between these, one at a time. */
const IDLE_MESSAGES = ["Get in touch with me :)", "Available for live shows"];
const COPIED = "Email copied to clipboard";

/** How long each idle message sits before the carousel advances. */
const ROTATE_MS = 3400;
/** How long the confirmation stays up before the label rolls back. */
const COPIED_MS = 2200;
/** Longer when the copy failed: the address itself is on screen to read. */
const FAILED_MS = 6000;

/**
 * Row height in em, animated directly rather than through the "translate
 * by 50% of a 2-row container" trick the confirmation roll used before —
 * that only works for exactly two rows, and the carousel needs a third.
 * Mirrors --nav-row in globals.css; keep the two in sync (same rationale
 * as lib/motion.ts keeping its constants in sync with the CSS custom
 * properties there).
 */
const ROW_EM = 1.3;

/** The ink fill, covering the pill. */
const FILLED = "inset(0 0% 0 0%)";
/** ...and parked just off one edge of it, taking up no width at all. */
const PARKED: Record<Edge, string> = {
  left: "inset(0 100% 0 0%)",
  right: "inset(0 0% 0 100%)",
};
/**
 * The two crossings are not the same event, so they don't share a
 * transition. Arriving is the one worth watching — a shade longer, on a
 * curve that accelerates through the middle of the pill and sets the
 * leading edge down at the far side. Leaving is housekeeping: shorter,
 * and on the site's usual out-curve, so the ink is gone by the time the
 * cursor is anywhere else.
 */
const FILL = { duration: 0.44, ease: ease.sweep };
const DRAIN = { duration: 0.34, ease: ease.outExpo };

/**
 * The booking pill in the fixed header, where the wordmark used to sit.
 *
 * Clicking copies the address rather than opening a mail client — most
 * visitors are not one click from a configured desktop client, and the
 * ones who are can still paste. The label rolls up to confirm, the same
 * roll the email on the About page uses (components/ContactEmail.tsx).
 *
 * Five things move here, in the site's existing vocabulary rather than as
 * a new set of effects:
 *
 *  - a live dot that breathes a ring outwards, the only thing on the page
 *    that moves on its own, so the pill reads as a current status rather
 *    than a decoration;
 *  - the idle label itself cycles between IDLE_MESSAGES on a timer, a
 *    small carousel rather than one static line — each letter rolls up
 *    on its own delay rather than the sentence snapping over as a block,
 *    so the swap reads as a wave sweeping across the word;
 *  - an ink fill that wipes in from whichever edge the pointer crossed —
 *    the same clip-path wipe as <Reveal>, turned sideways — with a second
 *    copy of the label riding the identical clip in paper, so the type
 *    inverts exactly as the fill passes under it rather than switching
 *    colour on its own clock. Enter from the right and it fills
 *    right-to-left; leave through the left and it drains back out that
 *    way. This is what the pill answers the cursor with, instead of the
 *    magnetic translate it used to carry (<MagneticLink>, still used by
 *    the menu toggle opposite): on a bare mark, a few pixels of pull
 *    reads as physics, but on a pill this wide the same 0.25 strength
 *    walked it tens of pixels around a corner it is supposed to be
 *    pinned to, tracking every twitch of the pointer — motion with no
 *    story, closer to a layout bug than to a hover state. The wipe uses
 *    the same information — where the cursor is — to say something
 *    ("it came from over there") and lands somewhere definite;
 *  - a press that compresses the pill a hair and springs back, anchored
 *    at its left edge so the corner it is pinned to stays put;
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
  const [idleIndex, setIdleIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const timer = useRef<number | undefined>(undefined);

  // The fill is driven by a motion value rather than an `animate` prop
  // because the edge it starts from has to be set *before* the fill starts
  // growing, in the same tick the pointer arrives. React batches the two
  // state updates a pointerenter would otherwise need into one render, so
  // Motion would only ever see "grow to full" and interpolate from
  // wherever the fill last came to rest — which is how a wipe meant to
  // follow the cursor in ends up entering from the far side instead.
  const fill = useMotionValue(PARKED.left);
  const restEdge = useRef<Edge>("left");
  const parked = useRef(true);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Paused rather than ticking in the background while hovered/focused or
  // while a confirmation is up: an auto-advancing line of text is easy to
  // half-read if it changes mid-glance, and both of those already mean a
  // visitor's attention is on the pill. Restarting the interval on every
  // dependency change means the full ROTATE_MS is given after each pause,
  // not whatever was left when it stopped.
  useEffect(() => {
    if (state !== "idle" || hovered) return;
    const id = window.setInterval(() => {
      setIdleIndex((i) => (i + 1) % IDLE_MESSAGES.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [state, hovered]);

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

  useEffect(() => {
    const target = active ? FILLED : PARKED[restEdge.current];
    // Mount lands here with the fill already parked where it belongs.
    // Animating it to itself would be invisible but would still hold
    // `parked` false for the length of the wipe, and a pointer arriving
    // inside that window would be denied its entry edge for no reason.
    if (fill.get() === target) return;
    parked.current = false;
    const { duration, ease: curve } = active ? FILL : DRAIN;
    const controls = animate(fill, target, {
      duration: reducedMotion ? 0.01 : duration,
      ease: curve,
      onComplete: () => {
        parked.current = !active;
      },
    });
    return () => controls.stop();
  }, [active, reducedMotion, fill]);

  const content = {
    active,
    state,
    idleIndex,
    email,
    reducedMotion,
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      onPointerEnter={(e) => {
        const edge = edgeOf(e);
        restEdge.current = edge;
        // Move the fill to the edge the cursor came in on before it starts
        // growing — only while it is genuinely parked, where it has no
        // width and the move cannot be seen. Catch the pointer coming back
        // mid-drain and the fill is on screen; there it just refills from
        // where it got to, which is the honest answer to "you changed your
        // mind halfway".
        if (parked.current) fill.jump(PARKED[edge]);
        setHovered(true);
      }}
      onPointerLeave={(e) => {
        restEdge.current = edgeOf(e);
        setHovered(false);
      }}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      whileTap={reducedMotion ? undefined : { scale: 0.985 }}
      transition={pressSpring}
      data-cursor="copy"
      // Drives the border alongside the fill (see globals.css): grey ring
      // around a paper pill at rest, ink on ink once filled, so the
      // hovered state reads as one solid object rather than a dark fill
      // wearing the light pill's outline.
      data-active={active ? "true" : undefined}
      // Fixed regardless of which idle message is currently on screen —
      // the carousel is a sighted, decorative detail, and a screen
      // reader re-announcing the accessible name every few seconds as it
      // rotates would be closer to noise than to information. WCAG 2.5.3
      // is still satisfied: the name contains the visible text that is
      // on screen at any given moment, since both idle messages are in it.
      aria-label={`${IDLE_MESSAGES.join(" — ")} — click to copy ${email}`}
      className="availability-badge font-sans"
      style={{
        position: "relative",
        display: "inline-block",
        maxWidth: "100%",
        // The press scales the pill, and the pill is pinned to the
        // top-left corner: scaling from its own centre would walk it away
        // from the two edges it is anchored to. Compress towards the
        // corner instead, so only the free edge moves.
        transformOrigin: "left center",
        borderRadius: 9999,
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
        style={{
          clipPath: fill,
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
    </motion.button>
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
  idleIndex: number;
  email: string;
  reducedMotion: boolean;
};

function BadgeContent({
  active,
  state,
  idleIndex,
  email,
  reducedMotion,
}: ContentProps) {
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
      <RollingLabel
        state={state}
        idleIndex={idleIndex}
        email={email}
        reducedMotion={reducedMotion}
      />
      <IconSwap copied={state === "copied"} reducedMotion={reducedMotion} />
    </span>
  );
}

/**
 * The two idle messages plus the confirmation stacked in a one-line
 * window: the carousel and the copy confirmation are the same sliding
 * stack, just landing on a different row.
 *
 * Each row's own letters carry the motion — every character in a row
 * translates by the same distance the row itself would, but each one is
 * delayed a little more than the letter before it, so a row-swap arrives
 * as a wave crossing the word instead of the whole sentence changing at
 * once. Letters are only ever compared for width against their own
 * row's neighbours, never against the unrelated letter another message
 * happens to have at the same position — an earlier version split the
 * label into fixed columns shared by all three rows, which padded every
 * column out to its widest occupant across all three messages and left
 * the text visibly gap-toothed even at rest.
 *
 * Because the animated rows are absolutely positioned (so their letters
 * can move independently), they can't size the pill themselves. A
 * fourth, invisible copy of the three rows sits in normal flow
 * underneath just to set the width, each row intact rather than split —
 * the animated letters lay out to very nearly the same width on their
 * own (the same trade-off <SplitText> already makes elsewhere on the
 * site), so the two never visibly disagree.
 *
 * --nav-row (mirrored here as ROW_EM) is the row height, shared with the
 * About link so the two header items stay the same height.
 */
function RollingLabel({
  state,
  idleIndex,
  email,
  reducedMotion,
}: {
  state: ContentProps["state"];
  idleIndex: number;
  email: string;
  reducedMotion: boolean;
}) {
  // The confirmation always lives in the row after the last idle message,
  // however many of those there are.
  const activeRow = state === "idle" ? idleIndex : IDLE_MESSAGES.length;
  // No clipboard: the address itself, to read or select by hand.
  const rows = [...IDLE_MESSAGES, state === "failed" ? email : COPIED];

  return (
    <span
      style={{
        position: "relative",
        display: "block",
        height: "var(--nav-row)",
        overflow: "hidden",
        // Left-aligned: the rows are different lengths, and centring them
        // would read as the text sliding sideways as well as up.
        textAlign: "left",
      }}
    >
      <span aria-hidden style={{ visibility: "hidden", display: "block" }}>
        {rows.map((text, i) => (
          <Row key={i}>{text}</Row>
        ))}
      </span>
      {rows.map((text, i) => (
        <WaveRow
          key={i}
          text={text}
          offset={i - activeRow}
          reducedMotion={reducedMotion}
        />
      ))}
    </span>
  );
}

/** One message, its letters free to travel to the next row on their own delay. */
function WaveRow({
  text,
  offset,
  reducedMotion,
}: {
  text: string;
  offset: number;
  reducedMotion: boolean;
}) {
  return (
    <span
      style={{
        position: "absolute",
        inset: 0,
        display: "block",
        height: "var(--nav-row)",
        lineHeight: "var(--nav-row)",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {Array.from(text).map((char, i) => (
        <motion.span
          key={i}
          style={{ display: "inline-block" }}
          initial={false}
          animate={{ y: `${offset * ROW_EM}em` }}
          transition={{
            duration: reducedMotion ? 0.01 : 0.45,
            delay: reducedMotion ? 0 : i * stagger.chars,
            ease: ease.inOutQuart,
          }}
        >
          {/* A lone space is collapsible whitespace and CSS trims it to
              nothing when it's the whole content of an inline-block. */}
          {char === " " ? " " : char}
        </motion.span>
      ))}
    </span>
  );
}

function Row({ children }: { children: string }) {
  return (
    <span
      style={{
        display: "block",
        height: "var(--nav-row)",
        // The row is taller than the font's own line box (see --nav-row's
        // comment in globals.css), so line-height has to equal it too —
        // otherwise the text sits at the top of the block instead of
        // centred in it, since block content aligns top by default.
        lineHeight: "var(--nav-row)",
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
