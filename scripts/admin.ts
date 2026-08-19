/**
 * Local-only admin UI for reordering categories and the photos inside
 * them. Run with `npm run admin`, open http://localhost:4577.
 *
 * This is deliberately NOT a Next.js route: the site's production build
 * has no API routes and no server, and this tool should never affect
 * that. It's a standalone Node HTTP server, binds to localhost only, and
 * edits `content/categories/**\/meta.md` directly:
 *
 *   - dragging categories rewrites each one's `order:` field
 *   - dragging photos within a category writes a `photoOrder:` list,
 *     which `scripts/ingest.ts` reads (see applyPhotoOrder there) — no
 *     files are renamed, so the ingest cache stays warm.
 *
 * After reordering, click "Run ingest" (or run `npm run ingest`
 * yourself), then commit and push as usual.
 */

import { execFile } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CATEGORIES_DIR = path.join(ROOT, "content", "categories");
const MEDIA_DIR = path.join(ROOT, "public", "media");
const PORT = 4577;

const IMAGE_EXT = /\.(jpe?g|png|tiff?|webp|avif)$/i;
const CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function applyPhotoOrder(files: string[], photoOrder: unknown): string[] {
  if (!Array.isArray(photoOrder)) return files;
  const present = new Set(files);
  const known = photoOrder.filter(
    (f): f is string => typeof f === "string" && present.has(f)
  );
  const seen = new Set(known);
  const rest = files.filter((f) => !seen.has(f));
  return [...known, ...rest];
}

interface CategoryState {
  folder: string;
  slug: string;
  title: string;
  order: number;
  cover: string;
  photos: string[];
}

async function listCategoryFolders(): Promise<string[]> {
  const entries = await readdir(CATEGORIES_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function readMeta(folder: string) {
  const metaPath = path.join(CATEGORIES_DIR, folder, "meta.md");
  const raw = await readFile(metaPath, "utf-8");
  return { metaPath, parsed: matter(raw) };
}

async function buildState(): Promise<CategoryState[]> {
  const folders = await listCategoryFolders();
  const categories: CategoryState[] = [];

  for (const folder of folders) {
    const dir = path.join(CATEGORIES_DIR, folder);
    const entries = await readdir(dir, { withFileTypes: true });
    if (!entries.some((e) => e.isFile() && e.name === "meta.md")) continue;

    const { parsed } = await readMeta(folder);
    const { data } = parsed;

    const images = entries
      .filter((e) => e.isFile() && IMAGE_EXT.test(e.name))
      .map((e) => e.name)
      .sort(naturalSort);

    categories.push({
      folder,
      slug: slugify(String(data.slug ?? folder)),
      title: String(data.title ?? folder),
      order: typeof data.order === "number" ? data.order : 999,
      cover: String(data.cover ?? ""),
      photos: applyPhotoOrder(images, data.photoOrder),
    });
  }

  categories.sort((a, b) => a.order - b.order || naturalSort(a.slug, b.slug));
  return categories;
}

async function updateMeta(
  folder: string,
  mutate: (data: Record<string, unknown>) => void
) {
  const { metaPath, parsed } = await readMeta(folder);
  // gray-matter parses bare YAML dates into JS Date objects; left alone,
  // re-stringifying would blow up `date: 2026-06-14` into a full ISO
  // timestamp. Normalize back to a plain date string first.
  if (parsed.data.date instanceof Date) {
    parsed.data.date = parsed.data.date.toISOString().slice(0, 10);
  }
  mutate(parsed.data);
  const out = matter.stringify(parsed.content, parsed.data);
  await writeFile(metaPath, out);
}

async function saveCategoryOrder(order: string[]) {
  await Promise.all(
    order.map((folder, i) => updateMeta(folder, (data) => { data.order = i + 1; }))
  );
}

async function savePhotoOrder(folder: string, order: string[]) {
  await updateMeta(folder, (data) => { data.photoOrder = order; });
}

async function findThumb(folder: string, filename: string): Promise<string | null> {
  const slug = slugify(folder);
  const id = slugify(path.basename(filename, path.extname(filename)));
  const mediaDir = path.join(MEDIA_DIR, slug);
  let entries;
  try {
    entries = await readdir(mediaDir);
  } catch {
    return null;
  }
  const candidates = entries
    .filter((f) => f.startsWith(`${id}-`) && IMAGE_EXT.test(f))
    .map((f) => ({
      file: f,
      width: Number(f.slice(id.length + 1, f.lastIndexOf(".")) || Infinity),
    }))
    .sort((a, b) => a.width - b.width);
  return candidates.length > 0 ? path.join(mediaDir, candidates[0].file) : null;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

async function serveFile(res: http.ServerResponse, filePath: string) {
  const buf = await readFile(filePath);
  const type = CONTENT_TYPE[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Content-Length": buf.length });
  res.end(buf);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(HTML);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 200, await buildState());
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/thumb/")) {
      const [folder, filename] = url.pathname
        .slice("/thumb/".length)
        .split("/")
        .map(decodeURIComponent);
      const thumb = await findThumb(folder, filename);
      const fallback = path.join(CATEGORIES_DIR, folder, filename);
      await serveFile(res, thumb ?? fallback);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/categories/reorder") {
      const { order } = JSON.parse(await readBody(req)) as { order: string[] };
      await saveCategoryOrder(order);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/photos/reorder") {
      const { folder, order } = JSON.parse(await readBody(req)) as {
        folder: string;
        order: string[];
      };
      await savePhotoOrder(folder, order);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ingest") {
      execFile(
        process.execPath,
        ["--experimental-strip-types", path.join(__dirname, "ingest.ts")],
        { cwd: ROOT },
        (err, stdout, stderr) => {
          sendJson(res, 200, { ok: !err, output: stdout + stderr });
        }
      );
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Admin panel: http://localhost:${PORT}`);
});

const HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Portfolio Admin</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, system-ui, sans-serif;
    background: #111; color: #eee;
    display: flex; height: 100vh; overflow: hidden;
  }
  header {
    position: fixed; top: 0; left: 0; right: 0; height: 52px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px; background: #1a1a1a; border-bottom: 1px solid #333;
    z-index: 10;
  }
  header h1 { font-size: 14px; font-weight: 600; margin: 0; opacity: 0.8; }
  header button {
    background: #eee; color: #111; border: none; border-radius: 6px;
    padding: 8px 14px; font-size: 13px; cursor: pointer; font-weight: 600;
  }
  header button:disabled { opacity: 0.5; cursor: default; }
  #status { font-size: 12px; opacity: 0.6; margin-right: 12px; }
  main { display: flex; width: 100%; padding-top: 52px; }
  section { flex: 1; overflow-y: auto; padding: 16px; }
  #categories { max-width: 340px; border-right: 1px solid #333; flex: none; width: 340px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.5; margin: 0 0 10px; }
  .row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px; margin-bottom: 6px; border-radius: 8px;
    background: #1c1c1c; border: 1px solid #2a2a2a; cursor: grab;
    user-select: none;
  }
  .row.dragging { opacity: 0.35; }
  .row.selected { border-color: #666; background: #232323; }
  .row img { width: 44px; height: 44px; object-fit: cover; border-radius: 4px; background: #333; flex: none; }
  .row .name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .name small { display: block; opacity: 0.5; font-size: 11px; }
  #photos .row .name { font-size: 12px; font-family: ui-monospace, monospace; }
  #photos.empty::before { content: "Select a category on the left."; opacity: 0.5; font-size: 13px; }
  pre#log {
    white-space: pre-wrap; font-size: 11px; background: #000; padding: 10px;
    border-radius: 6px; margin-top: 10px; max-height: 200px; overflow: auto; display: none;
  }
</style>
</head>
<body>
<header>
  <h1>Portfolio Admin — drag to reorder</h1>
  <div>
    <span id="status"></span>
    <button id="ingestBtn">Run ingest</button>
  </div>
</header>
<main>
  <section id="categories">
    <h2>Categories</h2>
    <div id="categoryList"></div>
  </section>
  <section>
    <h2 id="photosTitle">Photos</h2>
    <div id="photos" class="empty"></div>
    <pre id="log"></pre>
  </section>
</main>
<script>
let state = [];
let selected = null;

async function load() {
  state = await fetch('/api/state').then(r => r.json());
  renderCategories();
  renderPhotos();
}

function setStatus(text) {
  document.getElementById('status').textContent = text;
  if (text) setTimeout(() => { document.getElementById('status').textContent = ''; }, 1500);
}

function makeSortable(container, onChange) {
  let dragEl = null;
  container.addEventListener('dragstart', e => {
    dragEl = e.target.closest('[data-key]');
    if (dragEl) dragEl.classList.add('dragging');
  });
  container.addEventListener('dragend', () => {
    if (!dragEl) return;
    dragEl.classList.remove('dragging');
    const order = [...container.querySelectorAll('[data-key]')].map(el => el.dataset.key);
    dragEl = null;
    onChange(order);
  });
  container.addEventListener('dragover', e => {
    e.preventDefault();
    const target = e.target.closest('[data-key]');
    if (!target || target === dragEl || !dragEl) return;
    const rect = target.getBoundingClientRect();
    const before = (e.clientY - rect.top) / rect.height < 0.5;
    container.insertBefore(dragEl, before ? target : target.nextSibling);
  });
}

function renderCategories() {
  const list = document.getElementById('categoryList');
  list.innerHTML = '';
  for (const cat of state) {
    const row = document.createElement('div');
    row.className = 'row' + (selected === cat.folder ? ' selected' : '');
    row.draggable = true;
    row.dataset.key = cat.folder;
    const coverFile = cat.photos.find(p => p.toLowerCase().startsWith(cat.cover.toLowerCase())) || cat.photos[0] || '';
    row.innerHTML = \`
      <img loading="lazy" src="/thumb/\${encodeURIComponent(cat.folder)}/\${encodeURIComponent(coverFile)}" onerror="this.style.visibility='hidden'" />
      <div class="name">\${cat.title}<small>\${cat.photos.length} photos</small></div>
    \`;
    row.addEventListener('click', () => { selected = cat.folder; renderCategories(); renderPhotos(); });
    list.appendChild(row);
  }
  makeSortable(list, async (order) => {
    setStatus('Saving…');
    await fetch('/api/categories/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    state = order.map(folder => state.find(c => c.folder === folder));
    setStatus('Saved');
  });
}

function renderPhotos() {
  const el = document.getElementById('photos');
  const title = document.getElementById('photosTitle');
  const cat = state.find(c => c.folder === selected);
  if (!cat) {
    el.classList.add('empty');
    el.innerHTML = '';
    title.textContent = 'Photos';
    return;
  }
  title.textContent = 'Photos — ' + cat.title;
  el.classList.remove('empty');
  el.innerHTML = '';
  for (const photo of cat.photos) {
    const row = document.createElement('div');
    row.className = 'row';
    row.draggable = true;
    row.dataset.key = photo;
    row.innerHTML = \`
      <img loading="lazy" src="/thumb/\${encodeURIComponent(cat.folder)}/\${encodeURIComponent(photo)}" onerror="this.style.visibility='hidden'" />
      <div class="name">\${photo}</div>
    \`;
    el.appendChild(row);
  }
  makeSortable(el, async (order) => {
    setStatus('Saving…');
    await fetch('/api/photos/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: cat.folder, order }),
    });
    cat.photos = order;
    setStatus('Saved');
  });
}

document.getElementById('ingestBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const log = document.getElementById('log');
  btn.disabled = true;
  btn.textContent = 'Running ingest…';
  log.style.display = 'block';
  log.textContent = '';
  const res = await fetch('/api/ingest', { method: 'POST' }).then(r => r.json());
  log.textContent = res.output || (res.ok ? 'Done.' : 'Failed.');
  btn.disabled = false;
  btn.textContent = 'Run ingest';
});

load();
</script>
</body>
</html>`;
