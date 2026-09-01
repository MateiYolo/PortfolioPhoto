import { AvailabilityBadge } from "@/components/AvailabilityBadge";
import { NavLinks } from "@/components/NavLinks";
import { NavMenu } from "@/components/NavMenu";
import { getAbout } from "@/lib/content";

/**
 * Fixed, minimal nav, in two shapes with one breakpoint between them
 * (the .nav-bar-* rules in globals.css):
 *
 *  - with room for it, Home and About sit flat in the left corner and the
 *    booking pill moves to the right. A toggle guarding two entries is a
 *    click and a full-screen wipe charged for a list that fits in the
 *    corner the toggle occupies; where there is space for the list, the
 *    list is the menu.
 *  - on a phone, the pill takes the left corner back and the toggle
 *    returns to the right, opening the panel in components/NavMenu.tsx.
 *    Two links laid flat next to a pill that wide is a wrapped, cramped
 *    row, and a thumb has the whole screen to aim at instead.
 *
 * Both sets are always rendered and CSS decides which is on screen, so
 * the server-rendered markup is right at both widths and neither shape
 * flashes before a media query hook catches up.
 *
 * The items are separate fixed boxes rather than one flex row, because
 * they need opposite things from mix-blend-mode and the blend cannot be
 * handed to just one of them from inside a shared parent: a positioned,
 * z-indexed row is a stacking context, and a stacking context is an
 * isolated group, so a difference blend on a child would resolve against
 * the row's own empty backdrop instead of the page — leaving bare type
 * paper-white on a paper page. Applied to the fixed box itself, it
 * resolves against the page, which is what keeps the links and the
 * toggle legible over any photo (black on light backgrounds, inverting
 * to white over dark ones) without introducing a second colour to pick,
 * and — with no extra logic — inverts to white again once the menu's own
 * ink panel opens behind it.
 *
 * The pill opts out of that entirely: it is an object with its own paper
 * fill, and difference over a mid-grey photo would collapse the contrast
 * between its fill and its label, which are shifted by the same backdrop.
 * It carries its own contrast instead.
 *
 * The boxes are aligned by giving them the same vertical box (see
 * .nav-item and --nav-pad-y in globals.css), since there is no shared row
 * to centre them in.
 */
export function NavHeader() {
  const { contactEmail } = getAbout();

  return (
    <header>
      <div className="nav-bar-links nav-item">
        <NavLinks />
      </div>
      {contactEmail && (
        <div className="nav-bar-badge">
          <AvailabilityBadge email={contactEmail} />
        </div>
      )}
      <NavMenu />
    </header>
  );
}
