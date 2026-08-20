# Matei Convard, Photography Portfolio

A minimalist, black & white photography portfolio built with Next.js,
Tailwind, and Motion. Categories are managed as folders on disk: there is
no CMS login, no database, and no upload UI: you edit files locally and
push.

## Adding a category

```
mkdir content/categories/tokyo-nights
```

Drop 5–15 HD photos into that folder (any mix of portrait/landscape), then
add a `meta.md` next to them:

```
---
title: Tokyo Nights
date: 2026-03-14
blurb: Three nights walking Shinjuku with a 35mm and no plan.
cover: DSCF1187        # filename (no extension) of the homepage cover photo
order: 1                # homepage sort order, lowest first
---
```

Then:

```
npm run ingest
git add .
git commit -m "Add Tokyo Nights"
git push
```

Pushing triggers the Vercel deploy, and that's the entire publishing flow.

## Adding a category of videos

A category folder can hold video files (`.mp4`, `.mov`, `.m4v`) instead of,
or alongside, photos. The Wigglegram set is one of these. Everything else
is the same: same `meta.md`, same `npm run ingest`, and `cover:` can name a
clip as happily as a photo.

What ingest does with a clip is worth knowing, because it decides what you
should hand it. A wigglegram is a few frames on a loop, and the file that
comes off the camera is usually that loop already repeated out to 5-20
seconds, often with every frame held four times over to reach 30fps.
Ingest finds the loop, drops the held duplicates, and re-encodes just the
wiggle, so 190MB of source becomes about 1MB of mp4 that plays
identically. You don't need to trim or compress anything first: hand it
the file as it came off the camera.

On the site a clip is a still until something asks it to move. The
homepage shows its first frame, in grey like every other cover, and starts
it under the same hover that brings the colour in. Inside the category
every clip loops on its own, muted, with no controls, for as long as it is
on screen. `prefers-reduced-motion` gets the stills and nothing else.

Videos need `ffmpeg` on your PATH (`brew install ffmpeg`). Only that first
encode does: the mp4s are committed like every other derivative, so a
checkout without ffmpeg still builds and deploys the site.

### What `npm run ingest` does

- Reads each photo's real (EXIF-corrected) dimensions, so portrait and
  landscape both lay out correctly with no manual tagging.
- Cuts a poster frame off each video and runs it through every step below,
  so a clip lays out exactly like a photograph, then encodes the loop
  itself to mp4 at two widths.
- Generates AVIF derivatives at three widths (720/1440/2560px, never
  upscaled past the original) plus a tiny blurred placeholder, into
  `public/media/`.
- Writes `data/manifest.json`, the single file every page reads from.
- Is **idempotent**: it hashes each source file and skips anything
  unchanged, so re-running after adding one photo to an existing category
  only processes that one photo.

### Where the bytes live

Your original HD files and videos in `content/categories/**` are
**gitignored**: they stay on your disk (and in your own photo backup),
never in git. Only the generated `public/media/**` derivatives are
committed, at roughly 600KB per photo across all three sizes, or about
1.5MB per video clip across both of its.

If the repo ever outgrows that, `NEXT_PUBLIC_MEDIA_BASE` is the escape
hatch: point it at a bucket (Vercel Blob, Cloudflare R2, …), re-run ingest
against the bucket, and every page picks it up with no component changes.

## Reordering categories and photos

```
npm run admin      # http://localhost:4577
```

A small local-only page (not part of the deployed site) for
drag-and-drop reordering: category order on the left, and the photo
order within a category on the right. Both save straight to the
relevant `meta.md` on drop — category order updates `order:`, photo
order writes a `photoOrder:` filename list (no files are renamed, so
`npm run ingest`'s cache stays warm). Click "Run ingest" in the page, or
run it yourself, then commit and push as usual.

## Editing the About page

Edit `content/about/meta.md` (title, bio, contact email, contact links).
Bio paragraphs are separated by a **blank line**. A single sentence that
soft-wraps across several lines in your editor is still one paragraph.

Drop a single photo of yourself in `content/about/` (any filename) and run
`npm run ingest` to add your portrait.

## Local development

```
npm install
npm run dev       # http://localhost:3000
npm run build     # production build, verifies every route is fully static
```

## Stack

Next.js (App Router, fully static) · Tailwind CSS v4 · Motion (scroll
reveals, magnetic hover, the custom cursor) · Lenis (smooth scroll) ·
Sharp (build-time image pipeline) · React's native `<ViewTransition>` for
the shared-element morph from a homepage thumbnail into its category hero.

Everything respects `prefers-reduced-motion`.
