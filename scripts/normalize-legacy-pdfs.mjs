#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, access } from 'node:fs/promises';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PDFDocument } from 'pdf-lib';

const execFileAsync = promisify(execFile);
const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_LEGACY_ROOT = 'legacy/Webpage Uranos';
const NORMALIZED_ROOT = 'legacy/_normalized';

// Baseline observed from the archive's normal Lexmark scans: ~1183x1671px,
// ~4% JPEG ratio, ~238KB/page. Anything averaging well above that per
// internal page is almost certainly an oversized/weakly-compressed outlier
// (confirmed during the pilot: 3 Scholl Mathilde files produced via "Adobe
// Acrobat Image Conversion" at 2160x2880px and ~12-16% ratio, 10-12x the
// normal per-page size) rather than the norm — worth recompressing, not
// treating as "just how this document happens to be."
const BYTES_PER_PAGE_THRESHOLD = 700 * 1024; // 700KB/page

function isPdfLike(filename) {
  const ext = extname(filename).toLowerCase();
  return ext === '.pdf' || /\.pdf\(wb\)$/i.test(filename);
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findAllPdfs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findAllPdfs(full)));
    } else if (entry.isFile() && isPdfLike(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

async function needsNormalization(filePath) {
  const { size } = await stat(filePath);
  const bytes = await readFile(filePath);
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pageCount = doc.getPageCount() || 1;
  const bytesPerPage = size / pageCount;
  return { flagged: bytesPerPage > BYTES_PER_PAGE_THRESHOLD, size, pageCount, bytesPerPage };
}

async function recompress(inputPath, outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  // /ebook preset targets ~150dpi screen/ebook-quality images; explicit
  // resolution + downsampling flags make the target resolution unambiguous
  // rather than relying on the preset's defaults alone.
  //
  // -sPAPERSIZE=a4 -dFIXEDMEDIA -dPDFFitPage: the 3 outlier files found
  // during the pilot turned out to have their (already high-resolution)
  // scanned image placed on an absurd ~30x40 INCH page (2160x2880 *points*,
  // not pixels) — at that page size the image's effective resolution
  // computes to just ~72dpi, so Ghostscript's downsample-if-above-target
  // logic never triggers and a plain /ebook pass changes nothing (confirmed
  // empirically: 0% size reduction without these flags). Forcing the page
  // back down to a normal A4 size is what makes the *same* image data
  // register as its true, much-higher effective resolution, which is what
  // actually lets the downsampler do its job.
  await execFileAsync('gs', [
    '-q',
    '-dNOPAUSE',
    '-dBATCH',
    '-dSAFER',
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.4',
    '-dPDFSETTINGS=/ebook',
    '-sPAPERSIZE=a4',
    '-dFIXEDMEDIA',
    '-dPDFFitPage',
    '-dDownsampleColorImages=true',
    '-dColorImageResolution=150',
    '-dDownsampleGrayImages=true',
    '-dGrayImageResolution=150',
    '-dDownsampleMonoImages=true',
    '-dMonoImageResolution=300',
    `-sOutputFile=${outputPath}`,
    inputPath,
  ]);
}

async function main() {
  const args = process.argv.slice(2);
  const legacyDirArg = args.includes('--legacy-dir') ? args[args.indexOf('--legacy-dir') + 1] : null;
  const force = args.includes('--force');
  const legacyRoot = legacyDirArg ?? DEFAULT_LEGACY_ROOT;
  const legacyRootAbs = join(REPO_ROOT, legacyRoot);

  console.log(`Scanning all PDFs under "${legacyRoot}" for oversized/weakly-compressed outliers…`);
  const allPdfs = await findAllPdfs(legacyRootAbs);
  console.log(`Found ${allPdfs.length} PDF file(s) total.`);

  let flaggedCount = 0;
  let recompressedCount = 0;
  let skippedCount = 0;
  let savedBytes = 0;

  for (const filePath of allPdfs) {
    const relPath = relative(join(REPO_ROOT, 'legacy'), filePath);
    const outputPath = join(REPO_ROOT, NORMALIZED_ROOT, relative(join(REPO_ROOT, 'legacy'), filePath));

    const { flagged, size, pageCount, bytesPerPage } = await needsNormalization(filePath);
    if (!flagged) continue;
    flaggedCount++;

    if (!force && (await fileExists(outputPath))) {
      skippedCount++;
      continue;
    }

    console.log(
      `Recompressing ${relPath} (${(size / 1024 / 1024).toFixed(1)}MB, ${pageCount} page(s), ` +
        `${(bytesPerPage / 1024).toFixed(0)}KB/page)…`,
    );
    await recompress(filePath, outputPath);
    const { size: newSize } = await stat(outputPath);
    savedBytes += size - newSize;
    console.log(`  -> ${(newSize / 1024 / 1024).toFixed(1)}MB (saved ${((1 - newSize / size) * 100).toFixed(0)}%)`);
    recompressedCount++;
  }

  console.log(`
Flagged as oversized: ${flaggedCount}
Recompressed: ${recompressedCount}
Skipped (already normalized; use --force to redo): ${skippedCount}
Total space saved: ${(savedBytes / 1024 / 1024).toFixed(1)}MB`);
  console.log(`Normalized output written under ${NORMALIZED_ROOT}/ (mirrors the original legacy/ path).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
