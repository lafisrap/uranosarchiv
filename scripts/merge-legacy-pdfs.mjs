#!/usr/bin/env node
import { mkdir, writeFile, readFile, readdir, access, copyFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { groupLegacyFolder } from './lib/group-pages.mjs';
import { slugify } from './lib/slugify.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_LEGACY_ROOT = 'legacy/Webpage Uranos';
const MERGED_ROOT = 'legacy/_merged';
const NORMALIZED_ROOT = 'legacy/_normalized';

/**
 * Prefers scripts/normalize-legacy-pdfs.mjs's recompressed output over the
 * raw legacy scan, when one exists for this file — see that script's doc
 * comment for why some source PDFs need this (oversized/weakly-compressed
 * outliers found during the pilot).
 */
async function resolveSourcePath(fullPath) {
  const relPath = relative(join(REPO_ROOT, 'legacy'), fullPath);
  const normalizedPath = join(REPO_ROOT, NORMALIZED_ROOT, relPath);
  try {
    await access(normalizedPath);
    return normalizedPath;
  } catch {
    return fullPath;
  }
}

function parseArgs(argv) {
  const args = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--legacy-dir') args.legacyDir = argv[++i];
    else if (arg === '--category-slug') args.categorySlug = argv[++i];
    else if (arg === '--legacy-root') args.legacyRoot = argv[++i];
    else if (arg === '--force') args.force = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.legacyDir && !args.categorySlug) {
    throw new Error('--category-slug is required when --legacy-dir is given.');
  }
  return args;
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Merges one logical document's ordered source files into a single PDF.
 *
 * Deliberately does NOT assume "one source file = one page" — a handful of
 * documents in this archive (found during the pilot: three Scholl Mathilde
 * items produced via "Adobe Acrobat Image Conversion" rather than the usual
 * Lexmark scanner) are themselves already 50-160+ page PDFs even though
 * they're a single loose file with no page-sequence siblings. Copying only
 * page index 0 from each source file — the natural-looking shortcut — would
 * have silently discarded the other 99% of those documents. Instead, every
 * page of every source file is copied through, and the real output page
 * count is read back from the merged PDF itself rather than inferred from
 * the file count.
 */
async function mergeGroup(group, outputDir, force) {
  const outPath = join(outputDir, `${group.documentGroup}.pdf`);
  if (!force && (await fileExists(outPath))) {
    const existingBytes = await readFile(outPath);
    const existing = await PDFDocument.load(existingBytes, { updateMetadata: false });
    return {
      documentGroup: group.documentGroup,
      status: 'skipped-exists',
      pageCount: existing.getPageCount(),
    };
  }

  await mkdir(outputDir, { recursive: true });

  if (group.pages.length === 1) {
    // Still worth checking: is this "single file" already a complete
    // multi-page PDF on its own (see doc comment above)? A plain file copy
    // preserves that correctly either way — this branch only needs to
    // report the TRUE page count, not assume it's 1.
    const sourcePath = await resolveSourcePath(group.pages[0].fullPath);
    await copyFile(sourcePath, outPath);
    const bytes = await readFile(outPath);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const pageCount = doc.getPageCount();
    return {
      documentGroup: group.documentGroup,
      status: pageCount > 1 ? 'copied-single-file-multi-page' : 'copied-single-page',
      pageCount,
    };
  }

  const merged = await PDFDocument.create();
  for (const page of group.pages) {
    const sourcePath = await resolveSourcePath(page.fullPath);
    const bytes = await readFile(sourcePath);
    const src = await PDFDocument.load(bytes, { updateMetadata: false });
    const copiedPages = await merged.copyPages(src, src.getPageIndices()); // ALL pages, not just [0]
    for (const copiedPage of copiedPages) merged.addPage(copiedPage);
  }
  const mergedBytes = await merged.save();
  await writeFile(outPath, mergedBytes);
  return { documentGroup: group.documentGroup, status: 'merged', pageCount: merged.getPageCount() };
}

async function processCategory(legacyDirAbs, legacyFolderLabel, categorySlug, force) {
  const groups = await groupLegacyFolder(legacyDirAbs, legacyFolderLabel);
  const outputDir = join(REPO_ROOT, MERGED_ROOT, categorySlug);

  const results = [];
  for (const group of groups) {
    results.push(await mergeGroup(group, outputDir, force));
  }

  // Real page counts (post-merge, not inferred from source file counts) —
  // migrate-category.mjs reads this instead of re-deriving pageCount itself.
  const pageCounts = Object.fromEntries(results.map((r) => [r.documentGroup, r.pageCount]));
  await writeFile(join(outputDir, '_page-counts.json'), JSON.stringify(pageCounts, null, 2), 'utf-8');

  const merged = results.filter((r) => r.status === 'merged').length;
  const copied = results.filter((r) => r.status === 'copied-single-page').length;
  const copiedMultiPage = results.filter((r) => r.status === 'copied-single-file-multi-page').length;
  const skipped = results.filter((r) => r.status === 'skipped-exists').length;
  console.log(
    `${categorySlug}: ${groups.length} document(s) — ${merged} merged, ${copied} single-page copied, ` +
      `${copiedMultiPage} single-file-but-actually-multi-page copied (!), ${skipped} already existed.`,
  );
  if (copiedMultiPage > 0) {
    const names = results
      .filter((r) => r.status === 'copied-single-file-multi-page')
      .map((r) => `${r.documentGroup} (${r.pageCount} pages)`)
      .join(', ');
    console.log(`  ⚠ Unexpectedly multi-page single-file document(s): ${names}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const legacyRoot = args.legacyRoot ?? DEFAULT_LEGACY_ROOT;

  if (args.legacyDir) {
    console.log(`Merging "${args.legacyDir}" -> category "${args.categorySlug}"…`);
    await processCategory(join(REPO_ROOT, args.legacyDir), args.legacyDir, args.categorySlug, args.force);
    return;
  }

  // No specific category given: batch over every top-level folder under
  // legacy-root, deriving each one's category slug from its folder name.
  // This is the "go through all the sources" mode — for a real run you'd
  // normally still want scripts/config/categories.json's mapping (Phase 2),
  // but the default slugify(folderName) is a reasonable stand-in so this
  // script is useful standalone.
  const legacyRootAbs = join(REPO_ROOT, legacyRoot);
  const entries = (await readdir(legacyRootAbs, { withFileTypes: true })).filter((e) => e.isDirectory());
  console.log(`Scanning all ${entries.length} top-level folder(s) under "${legacyRoot}"…`);
  for (const entry of entries) {
    const categorySlug = slugify(entry.name);
    await processCategory(join(legacyRootAbs, entry.name), `${legacyRoot}/${entry.name}`, categorySlug, args.force);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
