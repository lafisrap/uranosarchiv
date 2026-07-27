import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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
    // Shared by every page of one logical scan, e.g. "090410-osterfest".
    // Unique WITHIN its category only (not globally) — deliberately has no
    // category prefix baked in, so renaming/reorganizing a category never
    // invalidates existing documentGroup values.
    documentGroup: z.string(),
    category: z.string(), // leaf category slug this belongs to
    date: z.string().nullable(), // ISO "1909-04-10", or null if undated
    dateRaw: z.string().optional(), // original YYMMDD token, for traceability
    dateSuffix: z.string().optional(), // letter disambiguator: "a" / "b" / "c"
    isUndated: z.boolean().default(false),
    place: z.string().optional(),
    sequenceIndex: z.number().default(1), // 1-based page/scan order within documentGroup
    pageCount: z.number().default(1), // total pages in the group (same value on every page's frontmatter)
    isVerbatim: z.boolean().default(false), // the legacy "(wb)" flag
    r2Key: z.string(), // normalized R2 object key, e.g. "scholl-mathilde/090410-osterfest/012.pdf"
    originalFilename: z.string(), // preserved raw legacy filename, for audit/debugging
    legacyFolder: z.string(), // e.g. "Scholl Mathilde/090410", traceability back to legacy/
    order: z.number().default(0), // manual override; default sort is date -> dateSuffix -> title
  }),
});

export const collections = { categories, documents };
