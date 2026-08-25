import Link from "next/link";
import { AvailabilityBadge } from "@/components/AvailabilityBadge";
import { MagneticLink } from "@/components/MagneticLink";
import { getAbout } from "@/lib/content";

/**
 * Fixed, minimal nav: the booking pill on the left, About on the right.
 *
 * The two are separate fixed boxes rather than one flex row, because they
 * need opposite things from mix-blend-mode and the blend cannot be handed
 * to just one of them from inside a shared parent: a positioned, z-indexed
 * row is a stacking context, and a stacking context is an isolated group,
 * so a difference blend on a child would resolve against the row's own
 * empty backdrop instead of the page — leaving the link paper-white on a
 * paper page. Applied to the fixed box itself, it resolves against the
 * page, which is what keeps bare type legible over any photo (black on
 * light backgrounds, inverting to white over dark ones) without
 * introducing a second colour to pick.
 *
 * The pill opts out of that entirely: it is an object with its own paper
 * fill, and difference over a mid-grey photo would collapse the contrast
 * between its fill and its label, which are shifted by the same backdrop.
 * It carries its own contrast instead.
 *
 * The two boxes are aligned by giving them the same vertical box (see
 * .nav-about and --nav-pad-y in globals.css), since there is no shared row
 * left to centre them in.
 */
export function NavHeader() {
  const { contactEmail } = getAbout();

  return (
    <header>
      {contactEmail && (
        <div
          className="fixed left-0 top-0 z-50"
          style={{ margin: "var(--gutter)" }}
        >
          <AvailabilityBadge email={contactEmail} />
        </div>
      )}
      <div
        className="nav-about fixed right-0 top-0 z-50"
        style={{
          margin: "var(--gutter)",
          mixBlendMode: "difference",
          color: "var(--color-paper)",
        }}
      >
        <MagneticLink strength={0.4}>
          <Link
            href="/about"
            className="font-sans uppercase tracking-[0.2em]"
            data-cursor="info"
          >
            About
          </Link>
        </MagneticLink>
      </div>
    </header>
  );
}
