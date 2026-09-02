/**
 * How a category's `date:` is printed, in one place: the homepage index line
 * (components/CategoryTile.tsx) shows the year alone, the category page
 * shows the month with it, and both have to agree about what a bare year in
 * a meta.md means.
 */

/**
 * A set shot over a year has no month worth printing, so `date: 2026` in a
 * meta.md is honoured as written. Left to the parser it would become the 1st
 * of January and print as a month nobody claimed.
 */
const YEAR_ONLY = /^\d{4}$/;

export function formatDate(iso: string): string {
  if (!iso) return "";
  const raw = iso.trim();
  if (YEAR_ONLY.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

/** Just the year, for somewhere a full date would be more than it's worth. */
export function yearOf(iso: string): string {
  if (!iso) return "";
  const raw = iso.trim();
  if (YEAR_ONLY.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return String(date.getFullYear());
}
