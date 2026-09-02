import Link from "next/link";
import { notFound } from "next/navigation";
import { ViewTransition } from "react";
import type { Metadata } from "next";
import { Arrive } from "@/components/Arrive";
import { CategoryPhotoSequence } from "@/components/CategoryPhotoSequence";
import { NextCategoryLink } from "@/components/NextCategoryLink";
import { SplitText } from "@/components/SplitText";
import { getAdjacentCategory, getCategories, getCategory } from "@/lib/content";
import { formatDate } from "@/lib/date";

export function generateStaticParams() {
  return getCategories().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) return {};
  return {
    title: `${category.title} / Matei Convard`,
    description: category.blurb,
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();

  const next = getAdjacentCategory(category.slug);

  // There is no cropped hero on this page. The cover simply opens the
  // sequence at its own aspect ratio, which is also what the homepage
  // thumbnail morphs into, so no photo is ever reframed to fit a band of
  // screen height it was never shot for.
  const photos = [
    category.cover,
    ...category.photos.filter((p) => p.id !== category.cover.id),
  ];

  return (
    <main>
      <section
        style={{
          paddingTop: "clamp(6rem, 12vw, 9rem)",
          paddingLeft: "var(--gutter)",
          paddingRight: "var(--gutter)",
          paddingBottom: "clamp(2.5rem, 6vw, 4rem)",
        }}
      >
        <ViewTransition name={`title-${category.slug}`} share="title-morph" default="none">
          <h1
            className="font-display"
            style={{ fontSize: "var(--step-3)", lineHeight: 1 }}
          >
            <SplitText text={category.title} />
          </h1>
        </ViewTransition>

        {(category.date || category.blurb) && (
          <div
            style={{
              marginTop: "1.5rem",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: "clamp(0.75rem, 3vw, 2.5rem)",
            }}
          >
            {category.date && (
              <Arrive>
                <span className="font-sans text-grey-500 text-[var(--step--1)] uppercase tracking-[0.15em]">
                  {formatDate(category.date)}
                </span>
              </Arrive>
            )}
            {category.blurb && (
              <Arrive delay={0.08}>
                <p
                  className="font-sans text-grey-700"
                  style={{ maxWidth: "46ch", fontSize: "var(--step-0)", lineHeight: 1.6 }}
                >
                  {category.blurb}
                </p>
              </Arrive>
            )}
          </div>
        )}
      </section>

      <CategoryPhotoSequence photos={photos} morphName={`photo-${category.slug}`} />

      <footer
        style={{
          padding: "var(--gutter)",
          paddingTop: "clamp(4rem, 10vw, 8rem)",
          paddingBottom: "clamp(6rem, 14vw, 10rem)",
        }}
      >
        {next && <NextCategoryLink slug={next.slug} title={next.title} />}
        <Link
          href="/"
          className="font-sans text-grey-500 text-[var(--step--1)] uppercase tracking-[0.2em]"
          style={{ display: "inline-block", marginTop: "3rem" }}
        >
          ← Index
        </Link>
      </footer>
    </main>
  );
}
