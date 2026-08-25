import { Arrive } from "@/components/Arrive";
import { AvailabilityBadge } from "@/components/AvailabilityBadge";
import { CategoryGrid } from "@/components/CategoryGrid";
import { SplitText } from "@/components/SplitText";
import { getAbout, getCategories } from "@/lib/content";

export default function HomePage() {
  const categories = getCategories();
  const { contactEmail } = getAbout();

  return (
    <main>
      {/*
        Deliberately short of a full screen: the hero ends around three
        quarters of the way down so the top of the first cover is already
        in the viewport on landing, and the page reads as having somewhere
        to go rather than as a title on an empty field. The booking pill
        sits at the other end of the same flex column, filling the space
        under the nav that the drop in height leaves behind.
      */}
      <section
        className="home-hero"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "clamp(1.25rem, 3vw, 2.5rem)",
          padding: "var(--gutter)",
          // Clear the fixed header: its own gutter padding, top and bottom,
          // plus a line of type, plus breathing room.
          paddingTop: "calc(var(--gutter) * 2 + 1.25rem)",
          paddingBottom: "clamp(1.25rem, 3vw, 2.5rem)",
        }}
      >
        {contactEmail && (
          <Arrive delay={0.1}>
            <AvailabilityBadge email={contactEmail} />
          </Arrive>
        )}

        {/* Auto margin rather than space-between, so the title still sits
            on the baseline of the section when there is no pill above it. */}
        <div style={{ marginTop: "auto" }}>
          <h1 className="font-display" style={{ fontSize: "var(--step-4)", lineHeight: 0.95 }}>
            <SplitText text="Fragments, an archive of memories" by="words" />
          </h1>
          <p
            className="font-sans text-grey-500 max-w-[34ch] md:max-w-none md:whitespace-nowrap"
            style={{
              marginTop: "1.25rem",
              fontSize: "var(--step-1)",
              textWrap: "balance",
            }}
          >
            A little space kept by Matei Convard, shooting film & digital.
          </p>
        </div>
      </section>

      {categories.length > 0 ? (
        <CategoryGrid categories={categories} />
      ) : (
        <div
          style={{
            padding: "var(--gutter)",
            paddingBottom: "20vh",
            maxWidth: "40ch",
          }}
        >
          <p className="font-sans text-grey-500" style={{ fontSize: "var(--step-0)" }}>
            No categories published yet. Add one under{" "}
            <code style={{ color: "var(--color-ink)" }}>content/categories/</code>{" "}
            and run <code style={{ color: "var(--color-ink)" }}>npm run ingest</code>.
          </p>
        </div>
      )}
    </main>
  );
}
