"use client";

import { useLenis } from "lenis/react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { MagneticLink } from "@/components/MagneticLink";
import { Reveal } from "@/components/Reveal";
import { duration, ease, stagger } from "@/lib/motion";
import { type Edge, edgeOf } from "@/lib/pointerEdge";
import { useCanHover } from "@/lib/useMediaQuery";
import { useReducedMotion } from "@/lib/useReducedMotion";

const LINKS = [
  { href: "/", label: "Home", cursor: "home" },
  { href: "/about", label: "About", cursor: "info" },
];

/**
 * The open/close choreography, in two speeds.
 *
 * A menu of two links is a waypoint, not a destination: whoever opens it
 * has already decided where they are going, and every frame between the
 * click and a clickable "About" is a frame spent waiting. A mouse makes
 * that worse — the pointer is already travelling toward where the link
 * will be, so the animation is not something the visitor watches, it is
 * something they arrive ahead of.
 *
 * So the hover-capable build is cut to roughly a third of a second end to
 * end, and leads with `outExpo`: the circle covers most of its ground in
 * the first few frames and settles into the last of it, which reads as
 * fast even where the number is not much smaller.
 *
 * And there it drops the links' own reveal entirely, rather than making
 * it quicker again. Nothing that ran on top of the panel was ever going
 * to be free: the links sit inside the panel, so the circle already
 * uncovers them as it sweeps — around 105ms in at a desktop size, since
 * it reaches the far corner they occupy at roughly four fifths of its
 * radius. A wipe of their own can only start after that and delay the
 * one moment the whole sequence exists for. Take it away and the panel's
 * own edge is the reveal, which is both faster than any delay + duration
 * pair and one motion instead of two.
 *
 * Touch keeps the staggered <Reveal>, where the extra beats are cover for
 * the trip a thumb has to make rather than a tax on it.
 *
 * Touch keeps the longer, `inOutQuart` version. There the panel is the
 * whole screen and a thumb has to travel it; the extra beats are cover
 * for that trip, not a tax on it.
 */
const TIMING = {
  hover: {
    panelIn: 0.42,
    panelOut: 0.3,
    panelEaseIn: ease.outExpo,
    mark: 0.28,
    /** The panel's own edge is the reveal here. */
    linkWipe: null,
  },
  touch: {
    panelIn: 0.65,
    panelOut: 0.65,
    panelEaseIn: ease.inOutQuart,
    mark: 0.45,
    linkWipe: {
      delay: 0.25,
      stagger: stagger.lines,
      duration: duration.slow,
      ease: ease.inOutQuart,
    },
  },
} as const;

/**
 * The underline under a hovered link, in the pill's language: it grows
 * from the edge the cursor came in on and collapses out of the edge it
 * leaves by (lib/pointerEdge.ts). Arriving is the half worth watching, so
 * it gets the longer sweep; leaving is brisk and out of the way.
 */
const UNDERLINE = {
  in: { duration: 0.4, ease: ease.sweep },
  out: { duration: 0.3, ease: ease.outExpo },
};

/**
 * The header's right-hand item: a two-line mark that morphs into a close
 * mark and opens a full-screen menu (Home, About). The wordmark used to be
 * this site's only way home (see NavHeader's own doc comment on why it
 * came out); this is what replaces it, rather than a second fixed link
 * competing with the booking pill for the same top-left corner.
 *
 * The toggle keeps the exact spot and blend trick the old About link used
 * — mix-blend-mode: difference against whatever is behind it — which is
 * what lets it invert to white with no extra state once the ink panel
 * opens behind it: difference(paper, ink) reads as white whether that ink
 * is a dark photo or this component's own backdrop.
 *
 * Three things move, past the panel's own reveal:
 *
 *  - the two bars rotate and slide together into an X, and spread slightly
 *    on hover even before a click — a small hint that they're interactive
 *    before they mean "close";
 *  - the panel opens as a circle wiping out from the toggle's corner
 *    (clip-path, the same technique <Reveal> uses for its mask wipe,
 *    turned into a circle instead of a straight edge) rather than a plain
 *    fade, and closes back into that same corner;
 *  - Home and About ride in on <Reveal> once the panel is underway, the
 *    same "wait out the transition already in progress, then rise"
 *    choreography <Arrive> uses for a page's own supporting text.
 *
 * Monochrome, same as everywhere else on this site: no accent colour, no
 * hover state that isn't the fill, the underline, or the motion itself.
 */
export function NavMenu() {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const timing = TIMING[useCanHover() ? "hover" : "touch"];
  const lenis = useLenis();
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // A route change is the one way the panel can go away without the close
  // button ever being clicked (browser back/forward while it's open); this
  // is the safety net for that. The normal path — clicking Home or About —
  // already closes it itself, immediately, rather than waiting for this
  // effect to catch up with a route that takes a moment to resolve.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    lenis?.stop();
    document.documentElement.classList.add("ink-overlay-open");
    return () => {
      document.body.style.overflow = prevOverflow;
      lenis?.start();
      document.documentElement.classList.remove("ink-overlay-open");
    };
  }, [open, lenis]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Moves focus into the panel on open and back to the toggle on close —
  // but only a close that follows a real open. Without wasOpen, this would
  // also fire on mount (open starts false) and steal focus onto the
  // toggle button the instant the page loads.
  //
  // The panel itself (tabIndex={-1} below), not the Home link, is what
  // gets focused: focusing Home directly used to draw its :focus-visible
  // ring the instant the panel opened, on a plain tap, on iOS Safari — a
  // square nobody asked for, since the visitor tapped the toggle, not
  // Tab-key'd their way to a link. A container taking focus for a screen
  // reader's benefit doesn't need a ring a sighted visitor can act on; a
  // real Tab press onto Home right after still draws one, correctly.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      panelRef.current?.focus({ preventScroll: true });
    } else if (wasOpen.current) {
      wasOpen.current = false;
      toggleRef.current?.focus();
    }
  }, [open]);

  return (
    <>
      <div
        className="nav-item fixed right-0 top-0 z-[90]"
        style={{
          margin: "var(--gutter)",
          mixBlendMode: "difference",
          color: "var(--color-paper)",
        }}
      >
        <MagneticLink strength={0.3}>
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onFocus={() => setHovered(true)}
            onBlur={() => setHovered(false)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            data-cursor={open ? "close" : "menu"}
            className="flex items-center"
            style={{ padding: "0.3em" }}
          >
            <ToggleMark
              open={open}
              hovered={hovered}
              speed={timing.mark}
              reducedMotion={reducedMotion}
            />
          </button>
        </MagneticLink>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="nav-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            className="fixed inset-0 z-[85] bg-ink"
            initial={{ clipPath: "circle(0% at 100% 0%)" }}
            animate={{ clipPath: "circle(150% at 100% 0%)" }}
            exit={{
              clipPath: "circle(0% at 100% 0%)",
              // Closing is its own transition rather than the one above:
              // the panel is in the way by then, and nobody is watching a
              // dismissal they have already committed to.
              transition: {
                duration: reducedMotion ? 0.01 : timing.panelOut,
                ease: ease.inOutQuart,
              },
            }}
            transition={{
              duration: reducedMotion ? 0.01 : timing.panelIn,
              ease: timing.panelEaseIn,
            }}
            onClick={() => setOpen(false)}
          >
            <nav
              ref={panelRef}
              tabIndex={-1}
              aria-label="Primary"
              className="flex h-full flex-col justify-center"
              style={{
                gap: "clamp(0.5rem, 2.5vw, 1.25rem)",
                paddingLeft: "var(--gutter)",
                paddingRight: "var(--gutter)",
                // No visible ring for this one: it's a container taking
                // focus so a screen reader announces "entered the menu",
                // not a control a sighted visitor needs pointed out — see
                // the effect above for why that distinction matters here.
                outline: "none",
              }}
            >
              {LINKS.map((link, i) => {
                const wipe = timing.linkWipe;
                return (
                  <MenuLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    cursor={link.cursor}
                    isCurrent={pathname === link.href}
                    wipe={
                      wipe && {
                        delay: wipe.delay + i * wipe.stagger,
                        duration: wipe.duration,
                        ease: wipe.ease,
                      }
                    }
                    reducedMotion={reducedMotion}
                    onNavigate={() => setOpen(false)}
                  />
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * One menu entry. No <MagneticLink> here any more, for two reasons that
 * compound: a link this large translating under the pointer is the same
 * aimless wobble the booking pill used to have (see AvailabilityBadge's
 * own note on why that went), and on touch — where <Reveal> is still in
 * play — that wobble was being *clipped*, because Reveal has to set
 * overflow: hidden for its own wipe. The magnet pushed "Home" a few
 * pixels right and the reveal box sheared the H off it. A hover effect
 * that eats the first letter of the word it is decorating is not a
 * trade-off worth balancing; it is just a bug with a spring on it.
 *
 * What answers the cursor instead is the underline, which grows from the
 * side the pointer entered by and collapses out of the side it leaves by,
 * and the arrow, which slides into its own fixed slot so nothing reflows.
 */
function MenuLink({
  href,
  label,
  cursor,
  isCurrent,
  wipe,
  reducedMotion,
  onNavigate,
}: {
  href: string;
  label: string;
  cursor: string;
  isCurrent: boolean;
  wipe: { delay: number; duration: number; ease: readonly [number, number, number, number] } | null;
  reducedMotion: boolean;
  onNavigate: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [origin, setOrigin] = useState<Edge>("left");
  // The underline only takes a new direction between passes: at rest it is
  // either scaled to nothing or covering the word, and moving its origin
  // at either of those is invisible. Mid-sweep it is neither, so it keeps
  // the direction it started with rather than flipping under the cursor.
  const settled = useRef(true);

  const turn = (e: ReactPointerEvent<HTMLElement>) => {
    if (settled.current) setOrigin(edgeOf(e));
  };
  const stroke = hovered ? UNDERLINE.in : UNDERLINE.out;

  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      onPointerEnter={(e) => {
        turn(e);
        setHovered(true);
      }}
      onPointerLeave={(e) => {
        turn(e);
        setHovered(false);
      }}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-current={isCurrent ? "page" : undefined}
      data-cursor={cursor}
      className="nav-menu-link font-display relative inline-block"
      style={{
        fontSize: "var(--step-3)",
        lineHeight: 1.15,
        color: isCurrent ? "var(--color-grey-500)" : "var(--color-paper)",
      }}
    >
      {label}
      <motion.span
        aria-hidden
        style={{
          display: "inline-block",
          width: "0.6em",
          height: "0.6em",
          marginLeft: "0.4em",
          verticalAlign: "middle",
        }}
        initial={false}
        animate={{
          x: hovered ? "0.15em" : "-0.15em",
          opacity: hovered ? 1 : 0,
        }}
        transition={{
          duration: reducedMotion ? 0.01 : duration.fast,
          ease: ease.outExpo,
        }}
      >
        <svg
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: "block", width: "100%", height: "100%" }}
        >
          <path d="M1.5 6h9M6.5 2l4 4-4 4" />
        </svg>
      </motion.span>
      <motion.span
        aria-hidden
        onAnimationStart={() => {
          settled.current = false;
        }}
        onAnimationComplete={() => {
          settled.current = true;
        }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "0.08em",
          height: "2px",
          background: "currentColor",
          transformOrigin: origin,
        }}
        initial={false}
        animate={{ scaleX: hovered ? 1 : 0 }}
        transition={{
          duration: reducedMotion ? 0.01 : stroke.duration,
          ease: stroke.ease,
        }}
      />
    </Link>
  );

  // Same box either way, wiped or not: the nav is a stretch-aligned flex
  // column, so without a block wrapper the link itself becomes the flex
  // item and spreads its hit area — and its underline — across the full
  // width of the panel.
  return wipe ? (
    <Reveal delay={wipe.delay} duration={wipe.duration} ease={wipe.ease}>
      {link}
    </Reveal>
  ) : (
    <div>{link}</div>
  );
}

/**
 * Two bars, positioned at rest and animated only on transform (y, rotate)
 * so the morph never touches layout. On open they slide to the same
 * vertical centre and rotate to ±45° to form the X; on hover, before any
 * click, they nudge apart slightly instead — interactive, not yet closing.
 */
function ToggleMark({
  open,
  hovered,
  speed,
  reducedMotion,
}: {
  open: boolean;
  hovered: boolean;
  speed: number;
  reducedMotion: boolean;
}) {
  // Shared with the panel (TIMING above) so the X finishes forming with
  // the wipe rather than trailing it — and so the hover nudge, which uses
  // the same transition, is a flick rather than a slow drift.
  const transition = {
    duration: reducedMotion ? 0.01 : speed,
    ease: ease.inOutQuart,
  };
  const bar = {
    position: "absolute" as const,
    left: 0,
    width: "100%",
    height: "1.5px",
    borderRadius: 9999,
    background: "currentColor",
    transformOrigin: "center" as const,
  };
  // The hover nudge is a hint, not a state change, so it only applies at
  // rest — once open, the bars are already committed to being an X.
  const hoverNudge = !open && hovered ? "0.06em" : "0em";

  return (
    <span
      aria-hidden
      style={{ position: "relative", display: "block", width: "1.15em", height: "0.8em" }}
    >
      <motion.span
        style={{ ...bar, top: 0 }}
        initial={false}
        animate={{
          y: open ? "0.4em" : `-${hoverNudge}`,
          rotate: open ? 45 : 0,
        }}
        transition={transition}
      />
      <motion.span
        style={{ ...bar, bottom: 0 }}
        initial={false}
        animate={{
          y: open ? "-0.4em" : hoverNudge,
          rotate: open ? -45 : 0,
        }}
        transition={transition}
      />
    </span>
  );
}
