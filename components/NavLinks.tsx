"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HoverUnderline } from "@/components/HoverUnderline";
import { NAV_LINKS } from "@/lib/nav";
import { useEdgeHover } from "@/lib/useEdgeHover";
import { useReducedMotion } from "@/lib/useReducedMotion";

/**
 * The desktop header's left-hand item: Home and About, laid out flat.
 *
 * Two entries is not enough to hide behind a toggle where there is room
 * to show them — the menu it replaces cost a click, a 300ms wipe and a
 * full-screen takeover to reveal a list that fits in the corner it was
 * launched from. It stays on phones (components/NavMenu.tsx), where the
 * corner genuinely isn't there; this is what a pointer gets instead. The
 * two are hidden and shown by one breakpoint in globals.css rather than
 * by a media query hook, so the server renders both and neither flashes
 * on first paint.
 *
 * Typography is the pill's, not the menu panel's: small uppercase sans at
 * --step--1, the same treatment every other supporting link on the site
 * gets (components/ContactLink.tsx). The panel's display-size links were
 * sized for a screen of their own and would read as a headline here.
 *
 * The blend and the box come from the fixed wrapper in NavHeader, which
 * is also where mix-blend-mode has to live — see NavMenu's note on why a
 * positioned, z-indexed parent cannot hand a difference blend down to a
 * child.
 */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="nav-links-row">
      {NAV_LINKS.map((link) => (
        <NavLink
          key={link.href}
          href={link.href}
          label={link.label}
          cursor={link.cursor}
          isCurrent={pathname === link.href}
        />
      ))}
    </nav>
  );
}

/**
 * One entry. The current page keeps its link — it is a normal way back to
 * the top of a page you are already on — but drops to grey, the same way
 * the menu panel marks it. Under the header's difference blend that
 * resolves to a mid-grey against paper and against a photo alike, so the
 * distinction survives whatever scrolls underneath it.
 */
function NavLink({
  href,
  label,
  cursor,
  isCurrent,
}: {
  href: string;
  label: string;
  cursor: string;
  isCurrent: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const edge = useEdgeHover();

  return (
    <Link
      href={href}
      aria-current={isCurrent ? "page" : undefined}
      data-cursor={cursor}
      className="relative inline-block font-sans uppercase tracking-[0.1em]"
      style={{ color: isCurrent ? "var(--color-grey-500)" : "inherit" }}
      onPointerEnter={edge.onPointerEnter}
      onPointerLeave={edge.onPointerLeave}
      onFocus={edge.onFocus}
      onBlur={edge.onBlur}
    >
      {label}
      <HoverUnderline
        hovered={edge.hovered}
        origin={edge.origin}
        reducedMotion={reducedMotion}
        onSweepStart={edge.onSweepStart}
        onSweepEnd={edge.onSweepEnd}
      />
    </Link>
  );
}
