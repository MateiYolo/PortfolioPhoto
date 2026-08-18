import Link from "next/link";
import { notFound } from "next/navigation";
import { ViewTransition } from "react";
import type { Metadata } from "next";
import { CategoryPhotoSequence } from "@/components/CategoryPhotoSequence";
import { MagneticLink } from "@/components/MagneticLink";
import { Photo } from "@/components/Photo";
import { Reveal } from "@/components/Reveal";
import { getAdjacentCategory, getCategories, getCategory } from "@/lib/content";

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
    title: `${category.title} — Matei Convard`,
    description: category.blurb,
  };
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
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

  return (
    <main>
      <section style={{ paddingTop: "clamp(5rem, 10vw, 7rem)" }}>
        <ViewTransition name={`photo-${category.slug}`} share="morph" default="none">
          <div style={{ padding: "0 var(--gutter)" }}>
            <Photo
              photo={category.cover}
              sizes="100vw"
              priority
              style={{
                aspectRatio: "auto",
                height: "70svh",
                borderRadius: 2,
              }}
            />
          </div>
        </ViewTransition>

        <div
          style={{
            padding: "var(--gutter)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <ViewTransition name={`title-${category.slug}`} share="title-morph" default="none">
            <h1
              className="font-display italic"
              style={{ fontSize: "var(--step-3)", lineHeight: 1 }}
            >
              {category.title}
            </h1>
          </ViewTransition>
          {category.date && (
            <span className="font-sans text-grey-500 text-[var(--step--1)] uppercase tracking-[0.15em]">
              {formatDate(category.date)}
            </span>
          )}
        </div>

        {category.blurb && (
          <Reveal>
            <p
              className="font-sans text-grey-700"
              style={{
                padding: "0 var(--gutter)",
                maxWidth: "48ch",
                marginBottom: "clamp(3rem, 8vw, 6rem)",
                fontSize: "var(--step-1)",
              }}
            >
              {category.blurb}
            </p>
          </Reveal>
        )}
      </section>

      <CategoryPhotoSequence photos={category.photos} />

      <footer
        style={{
          padding: "var(--gutter)",
          paddingTop: "clamp(4rem, 10vw, 8rem)",
          paddingBottom: "clamp(6rem, 14vw, 10rem)",
        }}
      >
        {next && (
          <MagneticLink strength={0.15}>
            <Link href={`/work/${next.slug}`} data-cursor="view" className="group block">
              <span className="font-sans text-grey-500 text-[var(--step--1)] uppercase tracking-[0.2em]">
                Next category
              </span>
              <span
                className="font-display italic block"
                style={{ fontSize: "var(--step-3)", marginTop: "0.5rem" }}
              >
                {next.title}
              </span>
            </Link>
          </MagneticLink>
        )}
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
