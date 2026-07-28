#!/usr/bin/env node
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupLegacyFolder } from './lib/group-pages.mjs';
import { uploadPdf } from './lib/r2-upload.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MERGED_ROOT = 'legacy/_merged';

function parseArgs(argv) {
  const args = { upload: false, force: false, regenerate: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--legacy-dir') args.legacyDir = argv[++i];
    else if (arg === '--category-slug') args.categorySlug = argv[++i];
    else if (arg === '--upload') args.upload = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--regenerate') args.regenerate = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.legacyDir || !args.categorySlug) {
    throw new Error('Usage: migrate-category.mjs --legacy-dir <path> --category-slug <slug> [--upload] [--force] [--regenerate]');
  }
  return args;
}

async function loadDotEnv() {
  const envPath = join(REPO_ROOT, '.env');
  try {
    await access(envPath);
  } catch {
    return; // no .env — fine unless --upload is requested, r2-upload.mjs will throw a clear error then
  }
  const content = await readFile(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/**
 * Hand-rolled frontmatter renderer — deliberately NOT using gray-matter's
 * automatic YAML stringification here. js-yaml's dumper writes numeric-
 * looking strings like "090410" unquoted, and Astro's content-collection
 * YAML parser then reads that back as the *number* 90410 (leading zero
 * dropped), failing the zod schema's `dateRaw: z.string()` check. Explicit
 * JSON.stringify() on every string/array value forces unambiguous YAML.
 */
function toFrontmatter(data) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (value === null) lines.push(`${key}: null`);
    else if (typeof value === 'string') lines.push(`${key}: ${JSON.stringify(value)}`);
    else if (Array.isArray(value)) lines.push(`${key}: ${JSON.stringify(value)}`);
    else lines.push(`${key}: ${value}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

function toCsvRow(fields) {
  return fields
    .map((f) => {
      const s = f === null || f === undefined ? '' : String(f);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(',');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadDotEnv();

  const legacyDirAbs = join(REPO_ROOT, args.legacyDir);
  const bucket = process.env.R2_BUCKET_NAME;
  if (args.upload && !bucket) {
    throw new Error('R2_BUCKET_NAME is not set — add it to .env (see .env.example).');
  }

  const mergedDir = join(REPO_ROOT, MERGED_ROOT, args.categorySlug);
  const pageCountsPath = join(mergedDir, '_page-counts.json');
  if (!(await fileExists(pageCountsPath))) {
    throw new Error(
      `No merged PDFs found for "${args.categorySlug}" (expected ${mergedDir}/_page-counts.json). ` +
        `Run scripts/merge-legacy-pdfs.mjs --legacy-dir "${args.legacyDir}" --category-slug ${args.categorySlug} first.`,
    );
  }
  const pageCounts = JSON.parse(await readFile(pageCountsPath, 'utf-8'));

  console.log(`Scanning "${args.legacyDir}" for category "${args.categorySlug}"…`);
  const groups = await groupLegacyFolder(legacyDirAbs, args.legacyDir);
  console.log(`Found ${groups.length} logical document(s).`);

  const contentDir = join(REPO_ROOT, 'src/content/documents', args.categorySlug);
  const csvRows = [
    toCsvRow([
      'documentGroup', 'title', 'legacyFolder', 'sourceFileCount', 'pageCount',
      'date', 'dateSuffix', 'isVerbatim', 'r2Key', 'needsReview', 'reviewReason',
    ]),
  ];

  let written = 0;
  let skippedMarkdown = 0;
  let uploaded = 0;
  let skippedUpload = 0;

  for (const group of groups) {
    const pageCount = pageCounts[group.documentGroup];
    if (pageCount === undefined) {
      throw new Error(
        `"${group.documentGroup}" has no entry in ${pageCountsPath} — re-run merge-legacy-pdfs.mjs for this category.`,
      );
    }
    const mergedPdfPath = join(mergedDir, `${group.documentGroup}.pdf`);
    const r2Key = `${args.categorySlug}/${group.documentGroup}.pdf`;
    const mdPath = join(contentDir, `${group.documentGroup}.md`);

    csvRows.push(
      toCsvRow([
        group.documentGroup,
        group.title,
        group.legacyFolder,
        group.pages.length,
        pageCount,
        group.date ?? '',
        group.dateSuffix ?? '',
        group.isVerbatim,
        r2Key,
        group.needsReview,
        group.reviewReason ?? '',
      ]),
    );

    const exists = await fileExists(mdPath);
    if (exists && !args.regenerate) {
      skippedMarkdown++;
    } else {
      const frontmatter = stripUndefined({
        title: group.title,
        documentGroup: group.documentGroup,
        category: args.categorySlug,
        date: group.date,
        dateRaw: group.dateRaw,
        dateSuffix: group.dateSuffix,
        isUndated: group.isUndated,
        place: group.place,
        pageCount,
        isVerbatim: group.isVerbatim,
        r2Key,
        originalFilenames: group.pages.map((p) => p.originalFilename),
        legacyFolder: group.legacyFolder,
        order: 0,
      });
      await mkdir(dirname(mdPath), { recursive: true });
      await writeFile(mdPath, toFrontmatter(frontmatter), 'utf-8');
      written++;
    }

    if (args.upload) {
      const result = await uploadPdf({
        bucket,
        key: r2Key,
        filePath: mergedPdfPath,
        force: args.force,
      });
      if (result.status === 'uploaded') uploaded++;
      else skippedUpload++;
    }
  }

  const reportPath = join(REPO_ROOT, 'scripts/migration-reports', `${args.categorySlug}-report.csv`);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, csvRows.join('\n') + '\n', 'utf-8');

  const needsReviewCount = groups.filter((g) => g.needsReview).length;

  console.log(`
Markdown: ${written} written, ${skippedMarkdown} skipped (already existed; use --regenerate to force).`);
  if (args.upload) {
    console.log(`R2 upload: ${uploaded} uploaded, ${skippedUpload} skipped (already existed; use --force to overwrite).`);
  } else {
    console.log('R2 upload: skipped (pass --upload to actually upload the merged PDFs).');
  }
  console.log(`Report written to ${reportPath}`);
  if (needsReviewCount > 0) {
    console.log(`⚠ ${needsReviewCount} document group(s) flagged needsReview — check the report before trusting this batch.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
