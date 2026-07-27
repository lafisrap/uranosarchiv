# Analysis: `legacy/Webpage Uranos`

Date of analysis: 2026-07-27

## TL;DR

`legacy/Webpage Uranos` itself is **not a website** in the technical sense — no HTML/CSS/JS/images in that folder, just a flat-file document archive: ~1,035 scanned PDF files (4.3 GB total) organized into ~19 top-level category folders. This is the *content* that used to be served on **www.uranosarchiv.de**, a real, now-defunct website ("Uranos-Archiv" — "Privates und freies Rudolf Steiner Archiv. Nachlässe von Pionieren der Anthroposophie."). The live domain has since expired and is now a parking page, but the **Wayback Machine has full captures** of the original site (2008–2017), from which the actual design, background images, and navigation structure were recovered — see "Recovered original website" below. The two recovered background images are saved at `reference/design-assets/bg_page0_earlier-version.jpg` and `reference/design-assets/bg_page1_final-version.jpg`.

## What's actually in the folder

```
find . -type f | sed -n 's/.*\.\([a-zA-Z0-9()]*\)$/\1/p' | sort | uniq -c
    829 pdf
    206 pdf(wb)      <- literal filename suffix, see below
      2 db           <- Windows Thumbs.db (thumbnail cache), irrelevant
```

- **No `.html`/`.htm`, no `.css`, no `.js` files anywhere in the repo** (checked recursively across the whole `uranos-archive` repo, not just this folder).
- **No image files** (`.jpg/.png/.gif/.svg/.webp` etc.) in this folder specifically. The real design assets (background images, nav buttons) were recovered separately from the Wayback Machine — see "Recovered original website" below.
- The two `.db` files are `Thumbs.db` (Windows Explorer thumbnail cache) inside `Schreibmaschinen/` — not usable, not a real database.
- All PDFs are **scans** (checked via `pdfinfo`): e.g. `Creator: HardCopy`, `Producer: Lexmark MFP`, A4 page size (595×842pt). These are photographed/scanned typewritten, handwritten, or printed pages — not born-digital text documents. Expect **no selectable text layer** in most files (would need OCR for full-text search).
- Note: `legacy/` is listed in the repo's `.gitignore`, so none of this content is (or should be) committed to git. Treat it as source material to migrate elsewhere (object storage, a CMS, a static-site content folder), not as something to check in wholesale.

## Folder structure (information architecture)

Two levels deep at most. Top-level folders function as **categories/collections**:

| Folder | Files | Notes |
|---|---|---|
| `E.S` | 184 (162 with `(wb)`) | "Esoteric hour/school" lecture notes — largest single collection |
| `Scholl Mathilde` | 163 (has 5 subfolders) | Works/notes attributed to Mathilde Scholl |
| `Typoskript` | 144 (1 subfolder `Europäisches`) | Typewritten transcripts |
| `Typoskript1` | 81 (3 subfolders: `FM`, `Handgeschriebene`, `Manuskript`) | A **parallel/duplicate** typescript collection — see "Data quality" below |
| `Unveröffentliches` | 78 (1 subfolder `Europäisches`) | Unpublished material |
| `Briefe Fotos` | 72 | Letters & photos (despite the name, still all PDFs — the "Fotos" are scanned photos captured as PDF, not standalone image files) |
| `Keyserlingk Notizen` | 50 | Notes related to Carl von Keyserlingk (biodynamic agriculture course context) |
| `Mitteilungen` | 38 | Newsletters/circulars, incl. Waldorf school bulletins (1929–1937) |
| `Schreibmaschinen` | 117 (7 with `(wb)`) | "Typewriters" — another typescript set |
| `Schreibmaschin1` | 22 (3 with `(wb)`) | Yet another parallel/duplicate set |
| `Handgeschriebenes` | 24 (1 subfolder) | Handwritten documents |
| `F.M` | 17 (13 with `(wb)`) | Initials-named collection |
| `E.S 1` | 7 | Small parallel/duplicate of `E.S` |
| `Bio-dyn. Präparat` | 13 | Biodynamic preparation notes |
| `Klartext` | 6 | "Plain text" transcripts of lectures |
| `West-Ost` | 9 | "West-East" themed set |
| `Manuskript` | 2 | Manuscripts |
| `Bücher` | 2 | "Books" — large compiled PDFs (multi-session compilations) |
| `Arbeit Nicole` | 0 files, 2 empty subfolders (`Mitteilungen`, `West-Ost`) | Empty scaffold, no content |

Subject matter: this is clearly a **Rudolf Steiner / anthroposophical archive** — esoteric school lecture notes, Waldorf school circulars, biodynamic agriculture notes (Keyserlingk course, Pfeiffer preparations), letters, and manuscripts. This aligns with other assistants in the broader workspace (e.g. `philo-von-freisinn`) that work with Steiner-related source material.

## File naming conventions

Filenames encode metadata that a modern rebuild should extract into real fields rather than leaving buried in strings:

- **Date prefix**: `YYMMDD` (e.g. `070601`, `140411`), sometimes with a **letter suffix** for multiple documents/transcribers on the same date (`070601`, `070601a`, `140411`, `140411b`).
- **Place name** appended after the date: `140411b Homunkulus.pdf`, `080522b Hamburg.pdf(wb)`.
- **Title fragment** for named lectures/topics: `171125 Individuelle Geistwesen.pdf`, `Steiner's Kosmogonie001.pdf`.
- **`undatiert ...`** prefix for undated items (15 files across the archive), e.g. `undatiert Gebet.pdf(wb)`.
- **Sequential numeric suffixes** (`001`, `002`, ...) for multi-page scans stored as separate single/few-page PDFs of the same source document (e.g. `Foto Dornach Soesman001.pdf`, `Foto Dornach Soesman002.pdf`; `27 10 1929 Jugend001.pdf` … `Jugend012.pdf`).
- **Literal `(wb)` appended to the extension** (`filename.pdf(wb)`, i.e. the actual filename ends in `.pdf(wb)`, not `.pdf`): present on 206 files, concentrated almost entirely in `E.S/` (162 of 184), `F.M/` (13 of 17), and smaller counts in `Schreibmaschinen`, `Schreibmaschin1`, `Unveröffentliches`. Likely means "Wortlaut" (verbatim transcript) or a similar internal tag distinguishing verified transcriptions from drafts — worth asking the archive owner to confirm before deciding how to model it (tag/flag vs. literal filename quirk to normalize away). **Important for rebuild**: this is a broken/non-standard extension (`.pdf(wb)` is not a valid MIME-recognized extension) and must be normalized during migration, or file servers/browsers will fail to recognize it as a PDF.

## Recovered original website (via Wayback Machine)

The live site at `www.uranosarchiv.de` is gone (the domain now redirects to a parking page), but the Internet Archive holds captures from **2008 through 2017** (CDX query: `web.archive.org/cdx/search/cdx?url=uranosarchiv.de&matchType=domain`). Note: standard `WebFetch` cannot reach `web.archive.org` directly in this environment — use `curl` (via Bash) against `web.archive.org/web/<timestamp>id_/<url>` instead, which works fine.

### Site identity

- Name: **Uranos Archiv** / "Uranos-Archiv"
- Tagline (from the 2008 homepage): *"Das Uranos Archiv ist ein privates und freies Rudolf Steiner Archiv. Nachlässe von Pionieren der Anthroposophie finden sich hier wieder. Der Archivzugang wird jedem gewährt."*
- Related/sister sites linked from the site's top bar: `fvn-rs.net` (forum — this is also where the `fvn.css`/`isearchfvn.html` GA full-text search tool bundled in the local archive comes from), `steiner-klartext.net` ("Klartextarchiv"), `steinerdatenbank.de`, and `uranosev.de` ("Uranos e.V." — a registered association, presumably the legal/organizational body behind the archive).

### Technology across its lifetime

1. **2008**: Built on **TYPO3 4.1 CMS** (`index.php?id=NN` routing, `typo3temp/` cache files, `fileadmin/template_ua/css/style.css`).
2. **~2009–2017**: Migrated to **hand-written static HTML** (HTML 4.01 Transitional, table-based layout, no CSS framework) served via a **frameset/iframe** structure:
   - `index.html` = the outer frame: fixed background image + absolutely-positioned invisible link overlays (see below) + an `<iframe name="content">` that loads the actual page.
   - `startseite.html`, `vortraege.html`, `seltenes.html`, `historische.html`, `nachlaesse.html`, `kontakt.html`, `impressum.html`, `verzeichnisse.html`, `links.html`, `aktuelles.html` = individual content pages loaded into that iframe.
   - A tiny `urwl.js` script fired `wl('pagename.html')` on every page's `<body onload>` — almost certainly a simple visit/hit counter.

### Background image and how it was used (the actual answer to "where's the background")

Recovered files, saved locally at:
- `reference/design-assets/bg_page1_final-version.jpg` (817×726 JPEG, the later/expanded version, from `images/bg_page1.jpg`)
- `reference/design-assets/bg_page0_earlier-version.jpg` (817×726 JPEG, an earlier/simpler version, from `images/bg_page0.jpg`)

Both show a hand-painted, watercolor-style **boomerang/L-shaped banner** in yellow/orange/blue tones with "URANOS ARCHIV" as the site title and the **entire main navigation painted directly into the image as text** (not real HTML text) — a common 2000s-era design technique. `bg_page0` has 7 nav labels (Startseite, Vorträge, Seltenes, Historische Dokumente, Nachlässe, Kontakt, Impressum); `bg_page1` has 10 (adds Aktuelles, Über uns, Verzeichnisse, Links; drops the separate "Kontakt" label, folding it into "Über uns").

The image was wired up via plain CSS on the frameset page:
```css
body { background-image:url(images/bg_page1.jpg); background-repeat:no-repeat; }
```
Because the nav labels were baked into the image (not real clickable text), the site faked a clickable navigation by layering **absolutely-positioned, invisible link images** (`images/tbutton.gif`, an all-purpose placeholder) exactly on top of each painted label's pixel coordinates, e.g.:
```css
#start {position:absolute; top:46px; left:207px;}
#vortr {position:absolute; top:177px; left:88px;}
#nachl {position:absolute; top:357px; left:88px;}
```
i.e. a hand-tuned, non-semantic "image map." **For a modern rebuild, do not reuse this technique** — recreate the visual style (the watercolor banner + title) as a real image/SVG asset with actual HTML/CSS navigation on top, not baked-in text with coordinate-matched invisible hotspots.

Other recovered image assets (small GIF nav-highlight/rollover icons, referenced in the static pages): `willkommenbl.gif`, `vortraegebl.gif`, `histdokbl2.gif`, `nachlassebl.gif`, `seltenesbl.gif`, `linksbl.gif`, `impressumbl.gif`, `aktuellesbl.gif`, `ueberunsbl.gif`, `quelle.gif`, `info.gif` — these are section-heading banner graphics used at the top of each content page (e.g. `startseite.html` opens with `<img src="images/willkommenbl.gif">`), not the page background itself. They weren't downloaded (lower priority than the main background), but are recoverable the same way via the CDX index if needed.

### Confirmed navigation / information architecture (straight from the archived HTML, not guessed)

Top-level nav (final static-site version, 10 items): **Startseite, Aktuelles, Über uns, Vorträge, Seltenes, Historische Dokumente, Nachlässe, Verzeichnisse, Links, Impressum**.

Sub-navigation per section (from `startseite.html`'s content overview and matching dedicated pages like `vortraege.html`, `nachlaesse.html`):

- **Vorträge**: Unveröffentlichte Vorträge · Klartextübertragung · Maschinengeschriebene Texte · Handgeschriebene Vorträge oder Texte · Typoskripte · Manuskripte
- **Seltenes**: Bücher 1. Ausgabe · Esoterische Stunden · Freimaurerei · Landwirtschaft · Manuskripte von Anthroposophen · Waldorf-Pädagogik
- **Historische Dokumente**: Fotos · Postkarten · Briefe · Telegramme · Veranstaltungen
- **Nachlässe**: Mathilde Scholl · Paul Ritter · Amalie Künstler · Albert Soesman · Johanna und Adalbert von Keyserlingk · Unbekannt · Dr. Erich Joseph Thiel

**This maps almost one-to-one onto the local folder taxonomy already documented above** — e.g. site's "Unveröffentlichte Vorträge" ≈ local `Unveröffentliches/`; "Nachlässe → Mathilde Scholl" ≈ local `Scholl Mathilde/`; "Nachlässe → Johanna und Adalbert von Keyserlingk" ≈ local `Keyserlingk Notizen/`; "Seltenes → Landwirtschaft" ≈ local `Bio-dyn. Präparat/`; "Seltenes → Esoterische Stunden" ≈ local `E.S/`. This strongly confirms the local `legacy/Webpage Uranos` folder is a direct filesystem mirror of the CMS's document categories, and the site's own IA (rather than the raw folder names) is the better naming scheme to carry into a modern rebuild.

Documents were also served directly off the CMS under predictable paths, e.g. `uranosarchiv/Vortraege/Unveroeffentlichte Vortraege/<file>.pdf`, `uranosarchiv/Historische Dokumente/Fotos/<file>.jpg`, `uranosarchiv/Seltenes/Freimaurerei/<file>.pdf` — confirming the site was a straightforward folder-per-category file server with a static HTML shell around it, not a database-driven catalog (at least not after the TYPO3 phase).

## Data quality issues to resolve before/during migration

1. **Duplicate/parallel folder sets**: `E.S` vs `E.S 1`; `Schreibmaschinen` vs `Schreibmaschin1`; `Typoskript` vs `Typoskript1` (which itself contains `FM`, `Handgeschriebene`, `Manuskript` subfolders that shadow top-level folders of similar names). These look like an old/new revision pair or a partial re-organization that was never finished. Needs a decision: merge, dedupe by content hash, or keep as distinct collections with clearer names.
2. **`.pdf(wb)` filenames**: not real PDF-recognized extensions; rename to `.pdf` and move the "wb" marker into metadata/tag if it's meaningful.
3. **Scanned, non-OCR'd pages**: full-text search on the rebuilt site will require an OCR pass (the existing PDFs likely have zero embedded text). Budget for this if search is a requirement.
4. **Empty scaffold** (`Arbeit Nicole/Mitteilungen`, `Arbeit Nicole/West-Ost`): no content, can likely be dropped.
5. **Large payload**: 4.3 GB across ~1,035 files — plan storage/CDN accordingly (object storage + signed URLs rather than bundling into a static site repo).
6. **Filenames contain diacritics and special characters** (ä/ö/ü, periods in folder names like `Bio-dyn. Präparat`, `E.S`), which needs URL-safe slugging for routing in a modern web app.

## Implications for the modern rebuild

Since there is no original design to reproduce, the "rebuild" is really a **new document-archive web app** over this content, informed by the existing taxonomy:

1. **Content model**: `Document { date, dateSuffix, place, title, collection (top-level folder), subcollection, sequenceIndex, isVerbatim(wb flag), fileUrl, ocrText? }`. Parse the folder + filename convention above into these fields during ingest rather than keeping raw filenames as the only metadata.
2. **Navigation**: reuse the site's **original information architecture** (confirmed above: Startseite / Aktuelles / Über uns / Vorträge / Seltenes / Historische Dokumente / Nachlässe / Verzeichnisse / Links / Impressum, with the documented sub-sections per category) rather than the raw local folder names, which are a rougher, partially-duplicated filesystem mirror of the same categories. Add a **timeline/date-based view** given how consistently everything is dated `YYMMDD`.
3. **Search**: full-text requires OCR first; until then, filename/metadata search covers date, place, and title fragments.
4. **PDF viewing**: in-browser PDF viewer per document, with multi-page scans (the `001/002/003...` sequences) presented as a single logical document with page navigation, not as separate list entries.
5. **Visual design**: the original hand-painted "boomerang" banner (yellow/orange/blue watercolor with the "URANOS ARCHIV" title) is recovered at `reference/design-assets/bg_page1_final-version.jpg`. Recommend treating it as a **style reference / brand mood board**, not something to reuse pixel-for-pixel: recreate the mark as a crisp vector/SVG or a re-rendered image, and replace the legacy technique of baking nav labels into the image with real HTML/CSS navigation. The color palette (warm yellow/orange against deep blue) and the hand-crafted, personal/archival feel are the things worth carrying forward.
6. **No JS framework/backend artifacts worth porting** — the site's logic was a TYPO3 install (2008) later replaced by static HTML tables + a frameset (2009–2017) with a trivial hit-counter script. None of this is worth reverse-engineering; only the content, the IA, and the visual identity are.
7. **Related sites to be aware of**: `uranosev.de` (the associated "Uranos e.V." registered association — worth checking if it's still active and who currently maintains the archive/domain), `fvn-rs.net`, `steiner-klartext.net`, `steinerdatenbank.de` — other Steiner-document sites the original Uranos-Archiv cross-linked with; may be worth checking for overlapping or higher-quality (OCR'd) versions of the same documents before re-scanning everything from the local PDFs.
