import type { Metadata } from "next";
import { AboutPortrait } from "@/components/AboutPortrait";
import { ContactEmail } from "@/components/ContactEmail";
import { MagneticLink } from "@/components/MagneticLink";
import { Reveal } from "@/components/Reveal";
import { getAbout } from "@/lib/content";

export const metadata: Metadata = {
  title: "About — Matei Convard",
};

export default function AboutPage() {
  const about = getAbout();
  // Paragraphs are separated by a blank line, not every line break — a YAML
  // `|` block in meta.md often soft-wraps a single paragraph across several
  // physical lines, so splitting on every "\n" would fragment one sentence
  // into several short <p> tags.
  const paragraphs = about.bio
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return (
    <main
      style={{
        paddingTop: "clamp(6rem, 12vw, 9rem)",
        paddingBottom: "clamp(6rem, 14vw, 10rem)",
        paddingLeft: "var(--gutter)",
        paddingRight: "var(--gutter)",
        display: "grid",
        gap: "clamp(2.5rem, 6vw, 5rem)",
      }}
      // Inline styles always win over classes, so the responsive column
      // count has to live entirely in Tailwind — grid-cols-1 by default,
      // two asymmetric columns from md up. Without a portrait yet, stay
      // single-column at every width rather than reserving an empty slot.
      className={
        about.photo
          ? "grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
          : "grid-cols-1"
      }
    >
      {about.photo && (
        <div>
          <Reveal>
            <AboutPortrait photo={about.photo} />
          </Reveal>
        </div>
      )}

      <div style={{ maxWidth: "56ch" }}>
        <Reveal>
          <h1 className="font-display italic" style={{ fontSize: "var(--step-3)" }}>
            {about.title}
          </h1>
        </Reveal>

        <div style={{ marginTop: "1.75rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          {paragraphs.map((p, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <p
                className="font-sans text-grey-700"
                style={{ fontSize: "var(--step-1)", lineHeight: 1.6 }}
              >
                {p}
              </p>
            </Reveal>
          ))}
        </div>

        {(about.contactEmail || about.contactLinks.length > 0) && (
          <div style={{ marginTop: "clamp(3rem, 6vw, 5rem)" }}>
            {about.contactEmail && (
              <Reveal>
                <ContactEmail email={about.contactEmail} />
              </Reveal>
            )}

            {about.contactLinks.length > 0 && (
              <ul
                style={{
                  marginTop: "1.5rem",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "1.5rem",
                  padding: 0,
                  listStyle: "none",
                }}
              >
                {about.contactLinks.map((link) => (
                  <li key={link.href}>
                    <MagneticLink strength={0.3}>
                      <a
                        href={link.href}
                        target={link.href.startsWith("http") ? "_blank" : undefined}
                        rel={link.href.startsWith("http") ? "noreferrer" : undefined}
                        className="font-sans text-[var(--step--1)] uppercase tracking-[0.15em] text-grey-500"
                        data-cursor="visit"
                      >
                        {link.label}
                      </a>
                    </MagneticLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
