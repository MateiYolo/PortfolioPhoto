# Adding a category

1. `mkdir content/categories/your-category-slug`
2. Drop 5–15 HD photos into that folder (JPEG/PNG/TIFF/WebP, any
   orientation), or videos (MP4/MOV/M4V), or both. Videos are handled as
   looping clips: see "Adding a category of videos" in the root README, and
   note they need `ffmpeg` installed.
3. Add a `meta.md` file in the same folder:

   ```
   ---
   title: Your Category Title
   date: 2026-03-14
   blurb: A few words about this set.
   cover: filename-without-extension   # which photo is the homepage cover
   order: 1                            # homepage sort order, lowest first
   ---
   ```

4. From the repo root, run `npm run ingest`.
5. Commit and push. Your HD originals and videos stay out of git (see
   `.gitignore`); only the optimised web derivatives under `public/media/`
   get committed.

This folder itself (and this file) can stay. Ingest only looks at
subfolders containing a `meta.md`.
