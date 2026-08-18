import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The ingest script pre-generates every size we ship, so the built-in
  // image optimizer is never in the path. Keeps the site fully static.
  images: { unoptimized: true },
  // Next 16's App Router uses its own bundled React internally, which
  // already includes the `ViewTransition` component (see react/canary), so
  // no experimental flag is needed here; navigations are transitions by
  // default, so <ViewTransition> just works. See components/CategoryTile
  // and components/CategoryPhotoSequence for the shared-element photo morph.
};

export default nextConfig;
