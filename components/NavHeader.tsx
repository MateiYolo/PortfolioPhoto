import { AvailabilityBadge } from "@/components/AvailabilityBadge";
import { NavMenu } from "@/components/NavMenu";
import { getAbout } from "@/lib/content";

/**
 * Fixed, minimal nav: the booking pill on the left, the menu toggle on the
 * right. Home and About live inside the menu (components/NavMenu.tsx)
 * rather than as a second fixed link up here — the wordmark that used to
 * lead the header, and that this whole layout was built around, was also
 * this site's only way back home, and it left with the header redesign
 * that put the booking pill in its place. Folding Home into the menu,
 * instead of restoring a second top-left anchor to compete with the pill,
 * is what brings it back without the header regaining a second reason to
 * fill that corner.
 *
 * The pill and the menu toggle are separate fixed boxes rather than one
 * flex row, because they need opposite things from mix-blend-mode and the
 * blend cannot be handed to just one of them from inside a shared parent:
 * a positioned, z-indexed row is a stacking context, and a stacking
 * context is an isolated group, so a difference blend on a child would
 * resolve against the row's own empty backdrop instead of the page —
 * leaving the toggle paper-white on a paper page. Applied to the fixed box
 * itself, it resolves against the page, which is what keeps a bare mark
 * legible over any photo (black on light backgrounds, inverting to white
 * over dark ones) without introducing a second colour to pick, and — with
 * no extra logic — inverts to white again once the menu's own ink panel
 * opens behind it.
 *
 * The pill opts out of that entirely: it is an object with its own paper
 * fill, and difference over a mid-grey photo would collapse the contrast
 * between its fill and its label, which are shifted by the same backdrop.
 * It carries its own contrast instead.
 *
 * The two boxes are aligned by giving them the same vertical box (see
 * .nav-item and --nav-pad-y in globals.css), since there is no shared row
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
      <NavMenu />
    </header>
  );
}
