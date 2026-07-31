# Lessons Learned: Uranos Archiv Rebuild

Date: 2026-07-30
Status: Phase 1 + Phase 2 complete, live at https://lafisrap.github.io/uranosarchiv

**Purpose of this file:** a self-contained onboarding document for a future session (human or LLM) picking up this project cold. It explains what the site *is*, how the original archive is *structured*, what the rebuilt architecture looks like, and — most importantly — the non-obvious traps that cost real debugging time the first time around. Read this before touching `scripts/` or `legacy/`. For narrower detail, see [`analysis.md`](analysis.md) (original site/archive analysis) and [`plan.md`](plan.md) (architecture decisions and rollout phases) — this file is the higher-level summary that ties them together after two phases of real implementation.

## What this project is

**Uranos Archiv** (www.uranosarchiv.de, live 2008–2017) was a private archive of scanned Rudolf Steiner documents — lecture transcripts, letters, photos, postcards — curated by the archive's owner (not Anthroposophy's official publisher, the Rudolf Steiner Verlag). The domain is dead. The owner commissioned a modern rebuild: same content, static site, GitHub Pages, Markdown-authored, PDF-viewable in-browser, no CMS, effectively $0/month hosting.

The **original site's design/nav was recovered from Wayback Machine captures**, not from any surviving source files — the legacy folder only contains scanned PDFs, not the old website's HTML/CSS. One genuinely useful artifact *was* recovered from a Wayback capture: `reference/design-assets/bg_page1_final-version.jpg`, a watercolor background image, from which the current header banner and logo swatch are cropped.

## The original archive's structure (`legacy/Webpage Uranos/`, gitignored)

~1035 scanned PDFs, ~4.3GB, one flat directory of ~19 category folders plus a handful of loose files sitting directly at the root (see "Traps" below — this second part was easy to miss). This directory is **pristine, untouched, read-only input** — every script reads from it and writes derived output elsewhere (`legacy/_normalized/`, `legacy/_merged/`, both also gitignored). Never edit anything under `legacy/` directly.

### The two document shapes

Every legacy folder contains logical documents in one of two shapes:

1. **A subfolder = one multi-page document.** E.g. `Scholl Mathilde/090410/Osterfest001.pdf … Osterfest022.pdf` is a single 22-page lecture, not 22 separate documents and not a sub-category. The folder name is *usually* the title/date, but not always (see traps).
2. **Loose top-level files grouped by shared stem.** E.g. `E.S/080226.pdf`, `080226a Berlin.pdf`, `080226b Berlin.pdf` are three *separate* one-page documents (different letter suffix = different document), while `Klartext/121205 Ergebnisse der Geistesforschung 063.pdf` is a *single* file whose own internal PDF page count might be 1 or might be 51 — the filename tells you nothing about internal page count (see next section).

### Filename grammar

Standard form: `YYMMDD[letter suffix][ff][ Place|Title].pdf`, e.g. `140411b Homunkulus.pdf`, `080522b Hamburg.pdf`, `071018.pdf`. Parsed by `scripts/lib/parse-filename.mjs`:

- `YYMMDD` → date, year window sanity-checked to 1880–1950 (Steiner died 1925; the archive also holds some posthumous/secondary material, hence the margin). Out-of-range years get flagged `needsReview`, never silently guessed.
- Optional single trailing **letter** (`a`, `b`, `c`...) disambiguates same-day multiple lectures — it is **not** a page-sequence letter.
- Optional `ff` marker = "folgende" (continuation) — informational only, not currently used to merge across files.
- The text after the date is either a **place name** (exact match against a hardcoded `KNOWN_PLACES` set — Berlin, Hamburg, München, etc.) or a **title**. `140411b Homunkulus` is a title ("Homunkulus" isn't a known place) that superficially looks like `080522b Hamburg` (a place) — the parser only trusts an *exact* known-place match, never a heuristic, because guessing wrong here silently mislabels a document.
- `undatiert ...` / `undatiert-...` prefix → explicitly undated document.
- Anything with no date-like prefix at all is *normal*, not an error — personal notes, photos, postcards are routinely undated (confirmed in `Keyserlingk Notizen/`).
- A trailing parenthetical, e.g. `(Scholl)`, is captured separately as `attribution`.
- `.pdf(wb)` is a **literal, non-typo filename suffix** on ~206 files (concentrated in `E.S/`, `F.M/`) — not a MIME type, not a mistake. Stripped by `normalize-extension.mjs`, which also reports it as `isVerbatim: true` in the resulting frontmatter (the field name refers to this literal-suffix marker, not to transcription accuracy — a naming choice worth remembering, it's easy to misread).

### The page-sequence trap (the single most important thing to know)

A trailing **3-digit** run (`...001`, `...022`, `...063`) *usually* means "this is page N of a multi-page scan" — but not always, and getting this wrong silently destroys data or corrupts titles. Two real bugs found the hard way:

- **`...Scholl 1927.pdf`** (a standalone file, year 1927 in the title) has its trailing `927` misread as sequence number 927 if you trust every trailing-3-digit run blindly.
- Three "single files" in `Scholl Mathilde/` (produced via "Adobe Acrobat Image Conversion" rather than the archive's usual Lexmark-scanner pipeline) are themselves **already 50–160+ page PDFs** despite having no sibling files and no folder — an early merge implementation that copied only page index 0 from each source file would have silently discarded 98%+ of these three documents.

**The rule that resolved both**, now in `scripts/lib/group-pages.mjs`: only trust a trailing 3-digit run as a real page-sequence number when there's more than one file sharing that stem, OR the lone file's number is exactly `001` (the archive's convention even for genuine single-page items, e.g. `Visitenkarte001.pdf`). And: never assume "1 source file = 1 output page" — always copy **every** page of every source file and read the **true** page count back from the merged PDF, never infer it from file/folder count. During the Phase 2 full-archive run this "single loose file that's internally already multi-page" turned out to be the *common* case (100+ instances), not the rare exception the Phase 1 pilot suggested — don't assume pilot-observed frequencies generalize.

### Known duplicate/quirky folders (already resolved, but good to know exist)

- `Typoskript1/FM/` and `Typoskript1/Manuskript/` are byte-for-byte duplicates of the top-level `F.M/` and `Manuskript/` folders; `Typoskript1/Handgeschriebene/` is empty; 4 specific loose files in `Typoskript1/` duplicate `Handgeschriebenes/`'s "Apokalypse Kinkel Alice 1–4". All excluded via `categories.json`'s `exclude` list for that entry.
- `Arbeit Nicole/` contains two subfolders (`Mitteilungen/`, `West-Ost/`) that are both **empty** — not duplicates of content, just genuinely nothing there. Correctly excluded (not even referenced in `categories.json`).
- `Briefe Fotos/` is one folder whose loose files actually belong to four different site categories (postcards/telegrams/letters/photos) — split via `includePattern` regex on the filename prefix, run once per sub-category.
- **The trap that got missed in Phase 2's first pass:** 6 loose files (`Foto Dornach Soesman001-002.pdf`, `Postkarte Dornach Soesman001-003.pdf`, `Steiner's Kosmogonie001.pdf`) sit **directly at the archive root**, not inside any subfolder — every other `categories.json` entry points at a specific subfolder, so a flat `ls` of the root is the only way to catch loose root-level files. Always check for these before considering a migration pass complete. (These turned out to belong to Albert Soesman's Nachlass, identified by rendering the PDFs to images and looking — filenames alone weren't enough to be sure.)
- **The `.env` credentials and the R2 bucket already existed from Phase 1** — don't recreate them; `scripts/migrate-category.mjs`'s `loadDotEnv()` reads `.env` automatically if present.

### Data-quality bugs in the migration tooling itself (not the archive — the scripts)

- **YAML round-trip bug:** using `gray-matter`/js-yaml to write frontmatter turned `dateRaw: "090410"` into unquoted `090410`, which Astro's content parser then read back as the *number* 90410 (leading zero dropped), failing the zod `z.string()` schema. Fixed by hand-rolling frontmatter serialization (`toFrontmatter()` in `migrate-category.mjs`) with explicit `JSON.stringify()` on every string/array value — never trust an automatic YAML dumper with fixed-width numeric-looking strings.
- **NFC/NFD Unicode bug (found during the Albert Soesman fix, Phase 2 follow-up):** macOS/APFS's `readdir()` returns filenames in **NFD** (decomposed) form — "ü" comes back as `u` + a combining diaeresis codepoint, not the single precomposed "ü" codepoint you get from typing it into a config file (NFC). A raw `Set.has()` exclusion check therefore silently fails for any excluded name containing an umlaut, even though the strings look character-for-character identical when printed. `scripts/lib/group-pages.mjs`'s `groupLegacyFolder()` now normalizes both the exclude-set entries and the on-disk names to NFC before comparing. **Any future string-equality comparison against filenames from this archive must account for this** — German filenames are everywhere here.
- **Ghostscript downsampling silently doing nothing:** three oversized PDFs (2160×2880 *pixel* images) had that image placed on a matching 2160×2880 *point* page (~30×40 inches) — at that page size the image's effective resolution computes to ~72dpi, below Ghostscript's downsample-if-above-target threshold, so a plain `/ebook` preset pass changed nothing (confirmed empirically: 0% size reduction). Fix: force the page back to normal A4 geometry first (`-sPAPERSIZE=a4 -dFIXEDMEDIA -dPDFFitPage`), *then* downsample — this makes Ghostscript see the image's true, much higher effective resolution and correctly trigger the downsampler (`scripts/normalize-legacy-pdfs.mjs`).

## The rebuilt site's architecture

**Astro 7** static site generator, **Astro Starlight** (v0.41.5, a documentation-site theme) providing the visual shell (sidebar, header, dark mode, mobile drawer, search via Pagefind), with our own category/document content **not** part of Starlight's own `docs` collection — Starlight is only reused for its chrome. **Cloudflare R2** (S3-compatible, free tier) hosts every PDF; PDFs never enter git. **GitHub Actions** builds and deploys to **GitHub Pages** on every push to `main`.

### Content model (`src/content.config.ts`)

Two hand-authored zod-typed collections, both simple flat/nested Markdown, no central manifest:

- **`categories`** — one `.md` file per nav node (can be nested in subfolders purely for author convenience; the *frontmatter* `parent`/`slug` fields define the real tree, not the file's directory location). Fields: `title`, `slug` (globally unique, referenced by `documents.category`), `parent` (another category's slug, or `null` for a root), `order`, `navLabel`, `showInNav`.
- **`documents`** — one `.md` file per *logical* (already-merged) document. Fields include `title`, `documentGroup`, `category` (a `categories.slug`), `date`/`dateRaw`/`isUndated`, `pageCount`, `r2Key`, `originalFilenames`, `legacyFolder`.

**This Markdown-authoring workflow is the one hard requirement carried through every change so far** (explicitly reconfirmed by the owner mid-Starlight-migration) — adding a category is still "write one small `.md` file, it appears in nav automatically," unchanged since Phase 1.

### Key source files

| File | Role |
|---|---|
| `src/lib/nav-tree.ts` | `buildNavTree()` walks `categories` by `parent` into a tree; `flattenNavTree()`, `findNavNodeByPath/BySlug()`, `breadcrumbsFor()`. |
| `src/lib/documents.ts` | `getDocumentsForCategory()`, `getAllDocumentsByCategory()` (validates every `category` reference resolves), `getAllLogicalDocuments()`. |
| `src/lib/r2.ts` | `r2Url(key)` — builds the public PDF URL from `PUBLIC_R2_BASE_URL`. |
| `src/components/starlight/CategorySidebar.astro` | Overrides Starlight's own (docs-collection-only) sidebar with one rendered from `buildNavTree()`. Special-cases `slug === 'startseite'` to link to `/` (its own dedicated page, not `/startseite/` — a route that intentionally never gets built). |
| `src/components/starlight/CategoryFooter.astro` | Overrides Starlight's footer: reuses Starlight's own Pagination component, adds site tagline + Impressum link. |
| `src/layouts/CategoryLayout.astro` | Wraps `<StarlightPage>`; shows subcategory tiles, document grid, or "not yet migrated" placeholder text depending on what a node has. |
| `src/pages/[...categoryPath].astro` | Catch-all route generating every category page — explicitly **excludes** `startseite`/`impressum` slugs (`EXCLUDED_SLUGS`) since those have their own dedicated `src/pages/*.astro` files instead. **Any future dedicated top-level page needs the same exclusion, in this file, in `index.astro`'s tile filter, and in `CategorySidebar.astro`'s link-building — three places currently, easy to update only two and get a silent 404.** |
| `src/components/document/DocumentViewer.astro` | Client-side pdf.js viewer, one PDF load per document (`pdfjs.getDocument({ url })` — object form required, not a bare string, in pdfjs-dist 6.x), page navigation, touch swipe, graceful no-JS/fetch-failure fallback to a plain download link. |

### The migration pipeline (`scripts/`)

Three composable CLI scripts, one config file, one batch runner:

1. **`normalize-legacy-pdfs.mjs`** — recursively scans a legacy root (default: the whole archive) for PDFs exceeding ~700KB/page, recompresses outliers via Ghostscript into `legacy/_normalized/` (mirrors the source path). Idempotent (skip-if-output-exists), safe to re-run over the whole archive at any time. Phase 1's pilot found 3 outliers; the real Phase 2 full-archive run found **148**, saving 775MB — don't assume a pilot's outlier count generalizes.
2. **`merge-legacy-pdfs.mjs --legacy-dir <path> --category-slug <slug> [--exclude <name>]... [--include-pattern <regex>] [--force]`** — groups one legacy folder into logical documents (`scripts/lib/group-pages.mjs`), merges each into one PDF under `legacy/_merged/<category-slug>/`, prefers `_normalized/` input over raw `legacy/` input when available, writes `_page-counts.json` (real post-merge page counts, source of truth for the next step).
3. **`migrate-category.mjs`** — same grouping, generates one `.md` file per logical document under `src/content/documents/<category-slug>/` (skips existing files unless `--regenerate`/`--force`), optionally `--upload`s the merged PDF to R2 (skip-if-exists unless `--force`), writes a CSV report to `scripts/migration-reports/<slug>-report.csv` including a `needsReview` column — **always check this column is all-`false` before trusting a batch**.
4. **`scripts/config/categories.json`** — the source-of-truth folder→category mapping: `{ legacyDir, categorySlug, exclude?, includePattern?, note? }[]`. This is where every duplicate-exclusion and category-split decision lives, each with a `note` explaining *why*. **Extend this file, don't hand-run the two scripts above for one-off categories** — consistency and idempotent re-runs depend on it.
5. **`migrate-all.mjs [--upload] [--force] [--skip-normalize] [--only <categorySlug>]`** — batch runner: runs `normalize-legacy-pdfs.mjs` once (whole-archive, not per-entry), then merge+migrate for every `categories.json` entry (or just one, via `--only`) by shelling out to the scripts above (not importing their internals — keeps this runner from diverging from the individually-tested CLIs).

**Standard workflow for adding a new category from a legacy folder:** add one entry to `categories.json` → `node scripts/migrate-all.mjs --only <new-slug>` (dry run, no upload) → check the generated `-report.csv` for any `needsReview: true` rows and eyeball a few merged PDFs → re-run with `--upload` → `npm run build` locally → commit + push.

### R2 setup

Bucket already exists (created during Phase 1, credentials in `.env`, gitignored, see `.env.example` for required keys: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `PUBLIC_R2_BASE_URL`). CORS policy had to be set via the Cloudflare **dashboard**, not the S3 API — the API token used doesn't have bucket-settings permission (`PutBucketCorsCommand` → `AccessDenied`). As of Phase 2, ~2.9GB used of the 10GB free tier.

### Deploy

`.github/workflows/pages.yml`: Node 26 (Astro 7 + pdfjs-dist require ≥22; earlier attempts at 20 caused lockfile inconsistencies), `npm ci`, `npm run build` (with `PUBLIC_R2_BASE_URL` from repo variables), `touch dist/.nojekyll` (**required** — GitHub Pages' default Jekyll processing silently drops any `_`-prefixed path, which is exactly Astro's hashed-asset folder `_astro/`; skipping this step deploys a site with no CSS/JS and no build-time error to explain why), then `upload-pages-artifact` + `deploy-pages`.

**A stale custom-domain redirect** on the *account's root* Pages site (`lafisrap.github.io`, pointed at a long-dead `epikur.berlin` CNAME from an unrelated old project) cascaded onto this *new* `uranosarchiv` project site's custom-domain behavior — cleared via `gh api repos/lafisrap/lafisrap.github.io/pages -X PUT -F cname=null`. Worth checking first if a freshly-deployed project site redirects somewhere unexpected.

## Current status (end of Phase 2)

- All ~19 legacy category folders + the 6 root-level loose files migrated: 600+ logical documents, ~2.9GB of merged PDFs on R2.
- Zero outstanding `needsReview` rows across every migration report.
- Genuinely-empty leaf categories (no matching legacy folder ever existed) correctly show the "not yet migrated" placeholder: Paul Ritter, Amalie Künstler, Erich Joseph Thiel (Nachlässe), Freimaurerei, Manuskripte von Anthroposophen (Seltenes), Veranstaltungen (Historische Dokumente). If real source material for any of these ever turns up, the workflow is the same "add a `categories.json` entry" step above.
- Full build: 638 pages, `npm run build` clean, live site spot-checked across routes/viewports/themes with zero console errors.

## What's still open (Phase 3, deferred — see `plan.md` for original framing)

`plan.md` predates the Starlight migration and the merged-PDF architecture in places — trust this file and the actual code over `plan.md`'s older narrative sections where they conflict, but `plan.md`'s Phase 3 backlog items (full-text search tuning beyond Starlight's default Pagefind setup, any analytics, further design polish) are still genuinely unstarted and worth a fresh look before resuming.
