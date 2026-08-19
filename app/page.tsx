import { CategoryGrid } from "@/components/CategoryGrid";
import { SplitText } from "@/components/SplitText";
import { getCategories } from "@/lib/content";

export default function HomePage() {
  const categories = getCategories();

  return (
    <main>
      <section
        style={{
          minHeight: "88svh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "var(--gutter)",
          paddingBottom: "clamp(2rem, 6vw, 4rem)",
        }}
      >
        <h1 className="font-display" style={{ fontSize: "var(--step-4)", lineHeight: 0.95 }}>
          <SplitText text="Matei Convard" by="words" />
        </h1>
        <p
          className="font-sans text-grey-500"
          style={{ maxWidth: "34ch", marginTop: "1.25rem", fontSize: "var(--step-1)" }}
        >
          A little space of mine, an ongoing archive of memories.
        </p>
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
