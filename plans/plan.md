# Plan: Modern rebuild of Uranos Archiv as a static site

Date: 2026-07-27
Status: draft, pending pilot implementation

## Context

The original **Uranos Archiv** (www.uranosarchiv.de, live 2008–2017) was a private Rudolf Steiner document archive. The domain is now dead/parked; the site's design and navigation were recovered from Wayback Machine captures (see [`analysis.md`](analysis.md)). The underlying content — ~1,035 scanned PDFs (4.3 GB) across ~19 categories — survives locally in `legacy/Webpage Uranos/` (gitignored). The goal now is to rebuild this as a modern, responsive (mobile/tablet/desktop) website, hosted on GitHub Pages, where both **content and site structure are authored as Markdown files** and published via a simple **commit → push → GitHub Actions** workflow — not a hand-maintained HTML site, and not a heavyweight CMS.

Decisions already made (via user Q&A) that this plan builds on:

| Decision | Choice |
|---|---|
| PDF/large-asset hosting | **Cloudflare R2** (S3-compatible). Free tier covers 10GB storage + 1M writes + 10M reads/month, permanently, plus $0 egress on all tiers — the entire 4.3GB corpus fits inside the free tier, so **PDF hosting is expected to cost $0/month** unless the archive grows past 10GB or traffic exceeds 10M reads/month (storage above that is $0.015/GB-month). PDFs never live in the git repo. |
| Structure format | **Distributed small Markdown files** — one file per category, one per physical scanned page. The nav tree and document groupings are *derived at build time* from frontmatter (`parent`, `category`, `documentGroup`, `order`), not from one central manifest. |
| Static site generator | **Astro** (v5, content layer API), typed content collections (zod schemas). Minimal JS ("islands" only where truly interactive — the PDF viewer and a client-side filter box). |
| Rollout | **Pilot first**: build the full pipeline end-to-end for two categories, then extend to the full corpus. |
| Rights/copyright | This project is commissioned by the **owner of the Uranos Archiv** — publishing the content is their call to make, not an open legal question for this plan. |
| Repo visibility | **Public** GitHub repo (free GitHub Pages, matches the original site's open-access model). |

Sibling repos in this workspace were checked and have **nothing reusable** for this (no SSG, no markdown pipeline, no PDF viewer component). The only reusable fragment is `ragrun/ragkeep/.github/workflows/pages.yml`'s `actions/upload-pages-artifact` + `actions/deploy-pages` pattern — extended below into a real build+deploy job (ragkeep's version checks out a pre-built `gh-pages` branch and never runs a build; ours builds in CI from `main`).

**Findings from directly inspecting the legacy folders** (not just `analysis.md`'s narrative) that shape the design below:
- `Scholl Mathilde/` mixes loose top-level files with subfolders where **each subfolder is one multi-page scanned work** (`090410/Osterfest001.pdf`…`022.pdf`, `Die Mystik/Mystik001.pdf`…`066.pdf`, `Erkenntnistheorie/` with 54 files). **A subfolder is a multi-page document, not a sub-category.**
- An **undocumented filename variant** exists: `100607ff-Die Mission einzelner Volksseelen-1911(Scholl).pdf` — dash-separated, with `ff` ("folgende"/continuation) appended to the date token, plus a `(Scholl)` parenthetical — different from the space-separated `YYMMDD[letter] Place.pdf` form seen in `E.S/`/`F.M/`. **Expect more undocumented variants once the full corpus is migrated** — the parser must flag-for-review rather than guess when a filename doesn't match a known pattern.
- `.pdf(wb)` is confirmed literal on the actual filename, mixed within the same folders as plain `.pdf` files (not isolated to one folder).
- The recovered banner JPGs are 817×726 with nav text baked into fixed pixels — confirmed genuinely unusable as-is for responsive nav.
- The repo has no `package.json`/lockfile/`src/` yet; `.gitignore` already correctly excludes `legacy` and `.env` (PDFs and R2 credentials never enter git).

## Prerequisites (not automatable by Claude — user must do these)

1. Create a **public** GitHub repository named `uranosarchiv` (the original name — not the `uranos-archive` working-folder name used locally during planning) and add it as the `origin` remote (none exists yet).
2. Create a Cloudflare account + R2 bucket (e.g. `uranosarchiv-pdfs`). **No custom domain needed** — public access via R2's default `pub-<hash>.r2.dev` URL is the plan's default for both dev and production (see "Cloudflare R2 integration" below for the tradeoff). A custom domain (would need a `uranosarchive.*` registration moved to Cloudflare nameservers) is an optional later upgrade, swappable via one env var, not a blocker.
3. In the repo: Settings → Pages → Build and deployment → Source: **"GitHub Actions"** (not "Deploy from a branch").
4. Generate an R2 API token (Access Key ID/Secret) for the one-time/occasional local migration script — this never runs in CI, so no GitHub secret is needed for it.

## Repo structure

```
uranosarchiv/                          # local working-folder name is currently "uranos-archive" — see note below
├── .github/workflows/pages.yml        # extended: real build+deploy (Phase 1)
├── legacy/                            # gitignored, untouched, source of truth for migration
├── plans/
│   ├── analysis.md
│   └── plan.md
├── reference/design-assets/           # mood-board only, never shipped as-is
├── scripts/
│   ├── migrate-category.mjs           # CLI entry point
│   ├── lib/
│   │   ├── parse-filename.mjs
│   │   ├── normalize-extension.mjs
│   │   ├── group-pages.mjs
│   │   ├── r2-upload.mjs
│   │   └── slugify.mjs
│   ├── config/categories.json         # legacy folder -> category slug/parent mapping
│   └── migration-reports/
│       └── <category-slug>-report.csv # audit trail, committed (no PDFs, just rows)
├── src/
│   ├── content.config.ts              # Astro 5 content-layer config (schemas below)
│   ├── content/
│   │   ├── categories/
│   │   │   ├── startseite.md
│   │   │   ├── nachlaesse.md
│   │   │   └── nachlaesse/
│   │   │       ├── scholl-mathilde.md
│   │   │       └── keyserlingk.md
│   │   └── documents/
│   │       └── nachlaesse/scholl-mathilde/
│   │           ├── 100607-die-mission-einzelner-volksseelen.md   # standalone, 1 page
│   │           └── 090410-osterfest/
│   │               ├── 001.md … 022.md                            # 1 file per physical scan
│   ├── components/
│   │   ├── nav/{SiteHeader,MainNav,MobileNav,Breadcrumbs}.astro
│   │   ├── document/{DocumentCard,DocumentViewer,PageStrip}.astro
│   │   ├── CategoryFilterBox.astro    # lightweight client-side title/date/place filter
│   │   └── SiteFooter.astro
│   ├── layouts/{BaseLayout,CategoryLayout,DocumentLayout}.astro
│   ├── lib/
│   │   ├── nav-tree.ts                # build-time category tree builder
│   │   ├── documents.ts               # build-time page -> logical-document grouping/sorting
│   │   └── r2.ts                      # r2Url() helper
│   ├── pages/
│   │   ├── index.astro                # Startseite
│   │   ├── impressum.astro
│   │   ├── [...categoryPath].astro    # any category/sub-category listing page
│   │   └── dokument/[...documentPath].astro  # single logical document page
│   └── styles/global.css
├── astro.config.mjs
├── package.json
├── tsconfig.json
└── .env.example
```

**Routing decision:** category pages live at `/{category-path}/`, document pages live at `/dokument/{category-path}/{documentGroup}/` — e.g. `/dokument/nachlaesse/scholl-mathilde/090410-osterfest/`, not a `--`-joined single segment. Since `documentGroup` is only unique *within* its category (not globally), `getStaticPaths` for the document route must key each generated page by the `(categoryPath, documentGroup)` pair together (iterate categories, then that category's logical documents) — the category segments already baked into the URL are what disambiguate two different categories that happen to reuse the same `documentGroup` slug (e.g. two categories each having a subfolder literally named `notizen`). A single catch-all trying to disambiguate "is this segment a category or a document" at the same URL depth is unnecessary complexity for v1 — the `/dokument/` prefix keeps the two collections' `getStaticPaths` completely independent.

Production hero/nav assets are new files under `src/assets/` (processed through `astro:assets` for responsive `<Image>` output) — the recovered JPGs in `reference/design-assets/` stay a mood board, never shipped directly (see §8). **Note**: the cropped/processed derivative must be *copied* into `src/assets/` as its own file — `reference/` sits outside `src/`, and Astro's content-collection image helpers resolve relative to files under `src/`, so keeping the production asset physically inside `src/assets/hero/` (rather than importing across from `reference/`) is the reliable path and avoids any ambiguity about what Vite/Astro will and won't resolve at build time.

## Content collection schemas (Astro 5 content layer)

`src/content.config.ts`:

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const categories = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/categories' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),                  // globally unique across the whole tree, e.g. "scholl-mathilde"
    parent: z.string().nullable(),      // slug of parent category, or null for top-level nav items
    order: z.number().default(0),       // sibling sort order
    navLabel: z.string().optional(),    // shorter label if `title` is long
    description: z.string().optional(),
    showInNav: z.boolean().default(true),
  }),
});

const documents = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/documents' }),
  schema: z.object({
    title: z.string(),                  // "Osterfest", "Die Mystik", or a lecture title
    documentGroup: z.string(),          // shared by every page of one logical scan, e.g. "090410-osterfest" — unique WITHIN its category only (not globally); deliberately has no category prefix baked in, so renaming/reorganizing a category never invalidates existing documentGroup values (see routing note below)
    category: z.string(),               // leaf category slug this belongs to — this field alone carries the category relationship
    date: z.string().nullable(),        // ISO "1909-04-10", or null if undated
    dateRaw: z.string().optional(),     // original YYMMDD token, for traceability
    dateSuffix: z.string().optional(),  // letter disambiguator: "a" / "b" / "c"
    isUndated: z.boolean().default(false),
    place: z.string().optional(),
    sequenceIndex: z.number().default(1),   // 1-based page/scan order within documentGroup
    pageCount: z.number().default(1),       // total pages in the group (same value on every page's frontmatter)
    isVerbatim: z.boolean().default(false), // the legacy "(wb)" flag
    r2Key: z.string(),                  // normalized R2 object key, e.g. "scholl-mathilde/090410-osterfest/012.pdf"
    originalFilename: z.string(),       // preserved raw legacy filename, for audit/debugging
    legacyFolder: z.string(),           // e.g. "Scholl Mathilde/090410", traceability back to legacy/
    order: z.number().default(0),       // manual override; default sort is date -> dateSuffix -> title
  }),
});

export const collections = { categories, documents };
```

**Why one markdown file per physical scanned page, not per logical work:** files start as one-per-scan (matching the ~1035 physical PDFs) and get joined into logical documents by `documentGroup` at build time — this is what lets `sequenceIndex`/`pageCount`/`r2Key` live naturally on a single frontmatter shape while still scaling to 1000+ small, git-diff-friendly files.

**Category slugs are globally unique** (not path-scoped) — there are only ~40 categories total (10 top nav + sub-nav items), trivial to keep unique by hand, and lets `parent` be a flat string reference instead of a full path.

## Build-time nav tree + document grouping

`src/lib/nav-tree.ts`:

```ts
import { getCollection, type CollectionEntry } from 'astro:content';

export interface NavNode {
  slug: string;
  title: string;
  navLabel: string;
  order: number;
  path: string;          // full URL path built by walking parents, e.g. "nachlaesse/scholl-mathilde"
  children: NavNode[];
}

export async function buildNavTree(): Promise<NavNode[]> {
  const cats = await getCollection('categories');
  const bySlug = new Map(cats.map((c) => [c.data.slug, c]));

  function pathFor(slug: string): string {
    const cat = bySlug.get(slug);
    if (!cat) throw new Error(`Unknown category slug referenced as parent: ${slug}`);
    return cat.data.parent ? `${pathFor(cat.data.parent)}/${cat.data.slug}` : cat.data.slug;
  }

  function toNode(cat: CollectionEntry<'categories'>): NavNode {
    const children = cats
      .filter((c) => c.data.parent === cat.data.slug)
      .sort((a, b) => a.data.order - b.data.order)
      .map(toNode);
    return {
      slug: cat.data.slug,
      title: cat.data.title,
      navLabel: cat.data.navLabel ?? cat.data.title,
      order: cat.data.order,
      path: pathFor(cat.data.slug),
      children,
    };
  }

  return cats
    .filter((c) => c.data.parent === null)
    .sort((a, b) => a.data.order - b.data.order)
    .map(toNode);
}

// flattens the tree for getStaticPaths()
export async function flattenNavTree(): Promise<NavNode[]> {
  const roots = await buildNavTree();
  const out: NavNode[] = [];
  const walk = (n: NavNode) => { out.push(n); n.children.forEach(walk); };
  roots.forEach(walk);
  return out;
}
```

`src/lib/documents.ts`:

```ts
import { getCollection, type CollectionEntry } from 'astro:content';

export interface LogicalDocument {
  documentGroup: string;
  title: string;
  category: string;
  date: string | null;
  dateSuffix?: string;
  isUndated: boolean;
  place?: string;
  isVerbatim: boolean;
  pages: CollectionEntry<'documents'>[]; // sorted by sequenceIndex
}

export async function getDocumentsForCategory(categorySlug: string): Promise<LogicalDocument[]> {
  const all = await getCollection('documents', (d) => d.data.category === categorySlug);
  const groups = new Map<string, CollectionEntry<'documents'>[]>();
  for (const doc of all) {
    const key = doc.data.documentGroup;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(doc);
  }

  const logical: LogicalDocument[] = [];
  for (const [documentGroup, pages] of groups) {
    pages.sort((a, b) => a.data.sequenceIndex - b.data.sequenceIndex);
    const first = pages[0].data;
    logical.push({
      documentGroup,
      title: first.title,
      category: first.category,
      date: first.date,
      dateSuffix: first.dateSuffix,
      isUndated: first.isUndated,
      place: first.place,
      isVerbatim: first.isVerbatim,
      pages,
    });
  }

  return logical.sort((a, b) => {
    if (a.date && b.date) {
      return a.date.localeCompare(b.date) || (a.dateSuffix ?? '').localeCompare(b.dateSuffix ?? '');
    }
    if (a.date) return -1;
    if (b.date) return 1;
    return a.title.localeCompare(b.title, 'de');
  });
}
```

`src/pages/[...categoryPath].astro` uses `flattenNavTree()` for `getStaticPaths`, resolves each `node.path` to a route param, and calls `getDocumentsForCategory(node.slug)` to render the listing. `src/pages/dokument/[...documentPath].astro` iterates all logical documents across all categories the same way, to generate one static page per `documentGroup`.

**Build-time validation**: `nav-tree.ts` throws if any category's `parent` (or any document's `category`) references a non-existent slug — this fails the build loudly on a frontmatter typo instead of producing a silent broken link.

## Multi-page scanned documents as one logical document

- Storage: each physical scan is its own R2 object (`r2Key`) and its own content markdown file (`sequenceIndex`, `pageCount`, shared `documentGroup`). No PDF merging — keeps the migration script simple and matches the legacy storage 1:1.
- Presentation: `getDocumentsForCategory()` groups pages by `documentGroup`, sorts by `sequenceIndex`; the document page renders **one** `<DocumentViewer>` with the ordered `pages` array — its own prev/next controls step across `r2Key`s, not across separate list entries. Category listing pages show exactly **one** `<DocumentCard>` per `documentGroup` (e.g. "Osterfest — 10. April 1909 (22 Seiten)"), never one card per physical PDF.
- `pageCount` is denormalized onto every page's frontmatter (filled in by the migration script) so listing pages can show "(22 Seiten)" without a second collection query.

## PDF viewing approach — recommendation: **pdf.js-based custom viewer**, not iframe or plain links

This revises the initial instinct toward "just link to the PDF": that doesn't actually solve the core problem here.

Why a custom viewer is the right call, specifically for this content:
- Our multi-page "documents" are N *separate* PDF files (`001.pdf`, `002.pdf`, …). A native browser PDF viewer has no way to page between separate files — there is no way around writing custom prev/next logic regardless of approach, so the "simple, zero-JS" option doesn't actually stay zero-JS once page navigation is required.
- Native `<embed>`/`<iframe src="file.pdf">` is unreliable specifically on iOS Safari — inconsistent inline rendering, sometimes forcing a share-sheet/OS-viewer detour instead of staying in-page. That directly conflicts with the responsive/mobile requirement.
- `pdfjs-dist` (Mozilla's PDF.js core, without its full prebuilt UI chrome) renders to `<canvas>` consistently across desktop and mobile, giving full control over a minimal control bar (prev/next page-file, zoom, "open original"/"download").
- No React/Vue/Svelte needed: Astro supports plain `<script type="module">` islands. `DocumentViewer.astro` renders a small custom element (e.g. `<uranos-pdf-viewer data-pages="...">`) plus an **always-rendered no-JS fallback** — a plain `<ul>` of `<a href={r2Url}>Seite N herunterladen</a>` links — progressively hidden once the script hydrates. Keeps it framework-free and accessible even if JS fails.
- Since each PDF object here is genuinely one page, rendering is just `getDocument(url).promise.then(pdf => pdf.getPage(1)).then(page => page.render(...))` per navigation step — no per-PDF page-count handling needed internally, "page navigation" in the UI means "load the next `r2Key`."
- Lazy-load: the viewer script + `pdfjs-dist` (+ worker) load only on document detail pages, and only the current page's canvas renders on demand — not all pages upfront, important for groups with 60+ pages.

**Worker path — the trickiest part of this component, test it in Phase 1, not later.** `pdfjs-dist` needs its worker script resolvable as a separate bundled file; under Vite (which Astro uses), the naive `pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.js'` approach frequently fails to resolve at the correct path after build. Configure it explicitly instead:
```ts
import * as pdfjs from 'pdfjs-dist';
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();
```
and verify Vite actually bundles the worker correctly (may need `worker: { format: 'es' }` in `astro.config.mjs`'s `vite` config block). **Build a minimal one-page proof-of-concept of this specific piece before wiring up the full `DocumentViewer` component** — if the worker path breaks, it's much cheaper to discover that in isolation than after the rest of the viewer is built on top of it.

**Touch gestures are not automatic.** `pdfjs-dist`'s core only renders to canvas — it does not provide swipe-to-next-page or pinch-to-zoom out of the box (that's a separate concern from the worker). Budget real implementation time for this in the pilot (e.g. basic `touchstart`/`touchend` delta-X swipe detection for prev/next, and either native CSS `touch-action: pinch-zoom` on the canvas or a small library like `panzoom` for pinch-zoom) — don't assume it comes for free with the rendering setup.

## Cloudflare R2 integration

- One bucket (e.g. `uranosarchiv-pdfs`); object keys use the **normalized** scheme from the schema above (`<category-slug>/<documentGroup>/<seq>.pdf`), never the raw diacritic-laden legacy filename — keeps R2 keys URL-safe.
- **Public access via R2's default `pub-<hash>.r2.dev` URL — no custom domain required.** Cloudflare's own docs call `r2.dev` "not recommended for production" (stricter/less predictable rate limits, no SLA), but for a niche cultural archive with modest traffic this is a reasonable default rather than a real blocker. A custom domain remains a drop-in later upgrade — swap one env var (`PUBLIC_R2_BASE_URL`), no code changes — if traffic ever outgrows it or the rate limiting becomes noticeable.
- Astro reads only a public base URL, injected as `PUBLIC_R2_BASE_URL`:
  ```ts
  // src/lib/r2.ts
  const base = import.meta.env.PUBLIC_R2_BASE_URL; // e.g. "https://pub-xxxxxxxx.r2.dev" (or a custom domain later)
  export function r2Url(key: string): string {
    return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  ```
- **No R2 credentials in GitHub Actions.** The build only string-templates URLs from `r2Key` + `PUBLIC_R2_BASE_URL`; it never calls R2's API. If a "verify all R2 objects exist" QA check is wanted later, that's a separate optional script, not part of deploy.
- **Upload happens locally**, via `scripts/lib/r2-upload.mjs` using `@aws-sdk/client-s3` against R2's S3-compatible endpoint (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`), reading credentials from a local `.env` (gitignored). One-time/occasional manual operation by whoever curates content — not a CI step.

`.env.example` (committed, no real secrets):
```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=uranosarchiv-pdfs
PUBLIC_R2_BASE_URL=https://pub-xxxxxxxxxxxxxxxx.r2.dev
```

## GitHub Actions workflow (`.github/workflows/pages.yml`)

Extends the existing file into a real two-job build+deploy (checkout `main`, not `gh-pages` — the current file checks out a `gh-pages` branch that doesn't exist yet and never runs a build):

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: ["main", "master"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
        env:
          PUBLIC_R2_BASE_URL: ${{ vars.PUBLIC_R2_BASE_URL }}
      - name: Ensure GitHub Pages skips Jekyll processing
        run: touch dist/.nojekyll
      - uses: actions/upload-pages-artifact@v3
        with: { path: ./dist }

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- `PUBLIC_R2_BASE_URL` is a repo **Variable** (Settings → Secrets and variables → Actions → Variables), not a Secret — it's a public URL.
- R2 write credentials are **never** added as GitHub secrets in this plan — no CI step uploads or verifies PDFs.
- **`.nojekyll` is not optional.** GitHub Pages runs incoming static output through Jekyll by default, and Jekyll silently *ignores* any file or folder starting with an underscore — which is exactly what Astro's hashed-asset output directory is called (`_astro/`). Without `.nojekyll`, the built site would deploy with all its CSS/JS missing, with no obvious build error to explain why. The `touch dist/.nojekyll` step above (or equivalently, an empty `public/.nojekyll` file committed to the repo, which Astro copies into `dist/` automatically) must be in place from the very first deploy.

## SEO: sitemap + robots.txt (pulled into Phase 1, not deferred)

At 1000+ static pages, a generated `sitemap.xml` is worth having from the start rather than bolting on later: `npx astro add sitemap` (installs `@astrojs/sitemap`, wires it into `astro.config.mjs` automatically) — requires `site: 'https://<final-pages-url>'` to be set in the config for it to generate correct absolute URLs. Pair with a simple `public/robots.txt` pointing at the sitemap. Both are a few minutes of setup, so there's no reason to defer this to a later phase.

## Responsive design

Breakpoints (mobile-first, plain CSS custom properties + media queries — no CSS framework needed for this content-first site): base = mobile, `@media (min-width: 640px)` = tablet, `@media (min-width: 1024px)` = desktop.

**Carrying the visual identity forward — concrete steps, not a redesign-from-nothing:**
1. **Don't ship the recovered JPGs as-is** — their nav labels are baked into fixed pixels; illegible/misaligned at any other size, and duplicates real nav text.
2. **Pragmatic Phase 1 asset step**: crop a **text-free region** of the watercolor artwork (the boomerang shape/brushwork, avoiding the painted-label areas) using ImageMagick/`sips`, export as `src/assets/hero-swoosh.jpg`; sample the palette (warm yellow/orange against deep blue) to define CSS custom properties (`--color-accent-yellow`, `--color-accent-orange`, `--color-brand-blue`). Process through `astro:assets`'s `<Image>` for responsive `srcset`/`sizes`.
3. **Real title, not baked-in text**: "URANOS ARCHIV" as an actual `<h1>` in `SiteHeader.astro`, a display webfont + letter-spacing, layered over the cropped swoosh via CSS `background-image`/`background-position`/`background-size: cover` — not absolute pixel coordinates like the legacy site.
4. **Real nav, not invisible image-map hotspots**: `MainNav.astro` is a `<nav>` with real `<a>` tags in a flex/grid row, styled with the sampled palette; `MobileNav.astro` collapses this into a hamburger-triggered drawer under 640px.
5. **Mobile banner**: a shorter `aspect-ratio`-constrained crop (or a flat gradient built from the sampled palette if the crop doesn't read well at short heights) rather than force-fitting the full 817×726 artwork into a narrow viewport.
6. **Later option (not committed for pilot)**: commission or vector-trace a clean redrawn version of the boomerang mark once the pilot validates the layout, replacing the cropped-JPG stopgap.

`CategoryFilterBox.astro`: a small vanilla-JS client-side filter over the already-rendered listing DOM (matches title/date/place substrings) — no server search needed at pilot scale. Full-text OCR search is explicitly out of scope (Phase 3+, see analysis.md data-quality item 3 — no PDFs currently have a text layer).

## Migration script (`scripts/migrate-category.mjs`)

Invoked as:
```
node scripts/migrate-category.mjs \
  --legacy-dir "legacy/Webpage Uranos/Scholl Mathilde" \
  --category-slug scholl-mathilde \
  --upload
```

**Pipeline:**
1. `normalizeExtension(filename)` — strip the literal `(wb)` suffix off the actual filename (`foo.pdf(wb)` → base `foo.pdf`, `isVerbatim: true`); `originalFilename` frontmatter always keeps the raw name for audit.
2. Recursively walk `--legacy-dir` (≤2 levels per analysis.md, written defensively for more):
   - **Subfolder found** (e.g. `090410/`, `Die Mystik/`) → the whole subfolder is one `documentGroup`; files inside are pages, `sequenceIndex` from each file's trailing 3-digit suffix; title/date come from the **folder name**.
   - **Loose top-level file** → check if its stem (after stripping a trailing 3-digit run) matches another top-level file's stem; if so, group them (handles cases like sequential top-level scans without a subfolder); otherwise it's a standalone one-page document.
3. `parseFilenameOrFolderName(stem)` — regex `^(\d{6})(ff)?([a-z])?[\s-]*(.*)$` extracts `YYMMDD`, optional `ff` continuation marker, optional letter suffix, and remaining title/place text; falls back to `undatiert ...` handling. **Anything that doesn't match either pattern is not guessed at** — recorded with `needsReview: true` in the CSV report, placeholder title = raw stem, `date: null`. The pilot already found one undocumented variant (`...ff-...(Scholl)`), so expect more in other categories.
4. Two-digit year `yy` → `1900 + yy` (this archive's content is 1900s–1930s, but the `Mitteilungen/` Waldorf-school circulars run into 1937). **Hard guard, don't silently trust the arithmetic:**
   ```js
   const year = 1900 + yy;
   if (year < 1880 || year > 1950) {
     // needsReview: true — don't guess. A typo like "990101" must not
     // silently become the year 2890, and a real edge-case date must not
     // be silently dropped either.
   }
   ```
5. Build `documentGroup` as `slugify(dateOrFolderTitle)` — e.g. `090410-osterfest` — **with no category prefix baked in** (the `category` field already carries that relationship; this keeps `documentGroup` stable if a category is later renamed/reorganized). Build `r2Key` as `${categorySlug}/${documentGroup}/${String(sequenceIndex).padStart(3,'0')}.pdf`.
6. Write one markdown file per physical page (via `gray-matter`'s stringify for clean YAML frontmatter) under the matching `src/content/documents/...` path — **skip-if-exists by default, matching the R2 upload behavior below.** Once content is live, a maintainer may hand-correct a frontmatter field (fix a mis-parsed title, add a missing place name); re-running the migration script must not silently clobber that manual edit. Add a `--regenerate` flag for the deliberate case of wanting a full rebuild of already-migrated markdown (e.g. after a `parse-filename.mjs` bugfix that should retroactively re-parse everything).
7. If `--upload`: stream each source PDF to R2 (`PutObjectCommand`, `@aws-sdk/client-s3`), `ContentType: application/pdf`, **skip-if-exists by default** (idempotent/resumable — important given the full 4.3GB corpus will take real wall-clock time and may need retries), `--force` to overwrite.
8. Emit `scripts/migration-reports/<categorySlug>-report.csv` (one row per source file: `originalFilename, legacyFolder, documentGroup, sequenceIndex, date, dateSuffix, isVerbatim, r2Key, needsReview`) — committed (small, no PDFs) as a permanent audit trail and the human checklist before trusting the Phase 2 full-corpus run.

## Phase 1 — Pilot (build this first, end-to-end)

**Pilot scope: two categories under Nachlässe**, chosen to exercise both code paths:
- `Nachlässe → Mathilde Scholl` (163 files, has subfolder-grouped multi-page documents — exercises grouping/pagination)
- `Nachlässe → Johanna und Adalbert von Keyserlingk` (local `Keyserlingk Notizen/`, 50 files, flat — exercises the loose-file/no-subfolder path)

1. Scaffold Astro 5 project at repo root (`npm create astro@latest`), wire in the structure above; `npx astro add sitemap` immediately, set `site:` in `astro.config.mjs`.
2. **Build the pdf.js worker proof-of-concept first, in isolation** (a bare page rendering one PDF from R2 via `pdfjs-dist`, with the worker path configured as shown above) — this is the single riskiest technical unknown in the whole plan; confirm it works before investing in the rest of `DocumentViewer`.
3. `src/content.config.ts` with both zod schemas.
4. Author category markdown stubs for the **full** top-nav + Nachlässe sub-nav (all ~17 nav items, so the nav looks complete even with only 2 populated leaf categories) — cheap (~20 tiny files), unblocks nav-tree testing immediately.
5. Build `nav-tree.ts`/`documents.ts`/`r2.ts`, layouts, `SiteHeader`/`MainNav`/`MobileNav`, `CategoryLayout`/`DocumentLayout`, `DocumentCard`, and the full `DocumentViewer` (now building on the proven worker setup from step 2), including basic touch swipe/pinch-zoom handling.
6. Create the R2 bucket with public `r2.dev` access, generate an API token, populate local `.env`.
7. Write and run `migrate-category.mjs` against the two pilot legacy folders with `--upload`; review the generated CSV reports for `needsReview` rows before trusting the output.
8. Responsive hero/banner asset step: crop the recovered JPG, copy the result into `src/assets/hero/`, sample palette into CSS variables, build the real HTML nav.
9. Extend `.github/workflows/pages.yml` (including the `.nojekyll` step); flip repo Pages source to "GitHub Actions"; set `PUBLIC_R2_BASE_URL` repo variable.
10. Push to `main`, verify the Actions run, verify the deployed pilot site end-to-end: nav renders, category listing shows grouped documents (one card per `documentGroup`, not per scan), a multi-page document opens with working page navigation in the pdf.js viewer including touch swipe/pinch-zoom, mobile viewport (ideally a real device, at least iOS Safari via devtools/BrowserStack) renders correctly and the PDF viewer works there too.

**Acceptance criterion for Phase 1**: both pilot categories live, navigable, and viewable end-to-end on GitHub Pages, on desktop and mobile, sourcing PDFs from R2.

## Phase 2 — Full migration (after pilot is approved)

1. Resolve the data-quality issues flagged in `analysis.md` **before** running at scale: decide merge-vs-keep-distinct for the duplicate/parallel folder sets (`E.S` vs `E.S 1`; `Schreibmaschinen` vs `Schreibmaschin1`; `Typoskript` vs `Typoskript1`'s shadowing subfolders); drop the empty `Arbeit Nicole/*` scaffold folders.
2. Extend `scripts/config/categories.json` to map all remaining ~17 legacy folders to their nav-confirmed category slugs (per the Wayback-recovered IA in `analysis.md` — e.g. local `E.S/` → `Seltenes → Esoterische Stunden`, `Bio-dyn. Präparat/` → `Seltenes → Landwirtschaft`).
3. Run `migrate-category.mjs` per remaining category, reviewing each `needsReview` CSV before moving to the next (expect more undocumented filename variants like the `ff`-suffix one found during the pilot; extend `parse-filename.mjs`'s fallback patterns as they turn up, rather than guessing).
4. Full R2 upload of the remaining ~870 PDFs.
5. Sanity-check Astro build time/generated page count at full ~1035-document scale; adjust `getStaticPaths` batching if needed.
6. Re-verify the deployed site at full scale.

## Phase 3 — Explicitly deferred (out of scope for this plan)

- OCR pass for full-text search (all PDFs are scans with no text layer per `analysis.md`).
- A custom domain for either the R2 asset URL or the GitHub Pages site itself — both currently run on their free default domains (`r2.dev`, `<user>.github.io/uranosarchiv`); either can be added later purely via config/env-var changes, no re-architecture.
- Vector/redrawn replacement of the cropped-JPG hero asset.

## Known risks to watch (not blockers, but worth expecting)

| Risk | Assessment |
|---|---|
| Build time at 1000+ markdown files | Astro 5's `glob` loader is fast, but `getStaticPaths` generating a page per logical document at full corpus scale (~1035 files) could push CI build time to a couple of minutes. Fine, just don't be surprised. |
| Filename-parsing complexity | The pilot already turned up one undocumented filename variant beyond what `analysis.md` recorded. Expect `parse-filename.mjs` to need several iterations as Phase 2 works through the remaining ~17 categories — the `needsReview` CSV workflow is exactly the right safety net for this, budget the iteration time rather than expecting the regex to be right on the first pass. |
| Mobile PDF viewer touch UX | Covered above (§ PDF viewing) — `pdfjs-dist` handles rendering, not gestures; swipe/pinch-zoom is custom work to budget into the Phase 1 pilot, not something that comes for free. |
| R2 `r2.dev` rate limits | Now the default (see Prerequisites) rather than a custom domain — low risk for this project's expected traffic, but worth an eye on Cloudflare's dashboard after launch in case a traffic spike (e.g. a blog post linking to the archive) hits the limit; the fix is a one-line env var swap to a custom domain, not a re-architecture. |

## Verification

- `npm run dev` → check the pilot category tree, listing, and document pages at ~375px/768px/1280px viewport widths.
- `npm run build && npm run preview` → sanity-check static output matches dev; confirm the build fails loudly (not silently) on a frontmatter typo referencing a missing category/parent slug.
- Push to `main`, confirm the GitHub Actions run is green and the Pages URL serves the updated site.
- Click through every nav item and at least one document per pilot category; open a multi-page PDF and confirm the pdf.js viewer's page navigation works; test on a real phone (or at minimum iOS Safari emulation) since that's the historically unreliable case for PDF-in-browser.
