import Link from "next/link";
import { MagneticLink } from "@/components/MagneticLink";

/**
 * Fixed, minimal nav. mix-blend-mode: difference keeps it legible over any
 * photo — black on light backgrounds, inverts to white over dark ones —
 * without ever introducing a second colour to pick.
 */
export function NavHeader() {
  return (
    <header
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-between"
      style={{
        padding: "var(--gutter)",
        mixBlendMode: "difference",
        color: "var(--color-paper)",
      }}
    >
      <MagneticLink strength={0.4}>
        <Link
          href="/"
          className="font-display text-[1.1rem] tracking-tight"
          data-cursor="home"
        >
          Matei Convard
        </Link>
      </MagneticLink>
      <MagneticLink strength={0.4}>
        <Link
          href="/about"
          className="font-sans text-[0.8rem] uppercase tracking-[0.2em]"
          data-cursor="info"
        >
          About
        </Link>
      </MagneticLink>
    </header>
  );
}
