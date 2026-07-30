import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

const categories = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/categories' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(), // globally unique across the whole tree, e.g. "scholl-mathilde"
    parent: z.string().nullable(), // slug of parent category, or null for top-level nav items
    order: z.number().default(0), // sibling sort order
    navLabel: z.string().optional(), // shorter label if `title` is long
    description: z.string().optional(),
    showInNav: z.boolean().default(true),
  }),
});

const documents = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/documents' }),
  schema: z.object({
    title: z.string(), // "Osterfest", "Die Mystik", or a lecture title
    // Slug for this logical document, e.g. "090410-osterfest". Unique WITHIN
    // its category only (not globally) — deliberately has no category prefix
    // baked in, so renaming/reorganizing a category never invalidates it.
    // One markdown file = one documentGroup = one merged PDF (see
    // scripts/merge-legacy-pdfs.mjs) — multi-page scans are pre-merged into
    // a single R2 object rather than split across many content files.
    documentGroup: z.string(),
    category: z.string(), // leaf category slug this belongs to
    date: z.string().nullable(), // ISO "1909-04-10", or null if undated
    dateRaw: z.string().optional(), // original YYMMDD token, for traceability
    dateSuffix: z.string().optional(), // letter disambiguator: "a" / "b" / "c"
    isUndated: z.boolean().default(false),
    place: z.string().optional(),
    pageCount: z.number().default(1), // TRUE page count of the merged PDF (see merge-legacy-pdfs.mjs's _page-counts.json — never assumed from source file count)
    isVerbatim: z.boolean().default(false), // the legacy "(wb)" flag on any constituent source file
    r2Key: z.string(), // normalized R2 object key for the single merged PDF, e.g. "scholl-mathilde/090410-osterfest.pdf"
    originalFilenames: z.array(z.string()), // every raw legacy filename merged into this document, for audit/debugging
    legacyFolder: z.string(), // e.g. "Scholl Mathilde/090410", traceability back to legacy/
    order: z.number().default(0), // manual override; default sort is date -> dateSuffix -> title
  }),
});

// Required by the Starlight integration itself — kept intentionally empty
// (no files in src/content/docs/). All real content lives in `categories`
// and `documents` above; Starlight only supplies the visual shell via
// <StarlightPage> and our own Sidebar override (see plans/plan.md).
const docs = defineCollection({ loader: docsLoader(), schema: docsSchema() });

export const collections = { categories, documents, docs };
