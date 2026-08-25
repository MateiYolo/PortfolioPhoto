import { AvailabilityBadge } from "@/components/AvailabilityBadge";
import { CategoryGrid } from "@/components/CategoryGrid";
import { SplitText } from "@/components/SplitText";
import { getCategories } from "@/lib/content";

export default function HomePage() {
  const categories = getCategories();

  return (
    <main>
      {/* Short of a full screen on purpose: the top of the first cover has
          to be visible on landing, or the page reads as one title floating
          in an empty room. The badge holds the other end of the section so
          the space the title isn't using is occupied rather than blank. */}
      <section
        style={{
          minHeight: "74svh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // A floor under the space-between, so the badge keeps its air
          // from the title on a short viewport where the section has
          // stopped having any slack to distribute.
          gap: "clamp(1.25rem, 3.5vh, 2.75rem)",
          padding: "var(--gutter)",
          paddingTop: "clamp(5rem, 12vh, 8.5rem)",
          paddingBottom: "clamp(2rem, 6vw, 4rem)",
        }}
      >
        <AvailabilityBadge />

        <div>
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
