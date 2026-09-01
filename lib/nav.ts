/**
 * The site's two primary destinations, in one place because they are now
 * rendered twice: as the desktop top bar (components/NavLinks.tsx) and as
 * the phone menu's full-screen panel (components/NavMenu.tsx). Plain data
 * rather than a const inside either component, so neither owns the other.
 */
export const NAV_LINKS = [
  { href: "/", label: "Home", cursor: "home" },
  { href: "/about", label: "About", cursor: "info" },
] as const;
