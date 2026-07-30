import { readdir } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import { normalizeExtension } from './normalize-extension.mjs';
import { parseFilenameOrFolderName } from './parse-filename.mjs';
import { slugify } from './slugify.mjs';

const TRAILING_SEQUENCE_RE = /^(.*?)(\d{3})$/;

function isPdfLike(filename) {
  const ext = extname(filename).toLowerCase();
  return ext === '.pdf' || /\.pdf\(wb\)$/i.test(filename);
}

/**
 * One entry per logical document (a subfolder, or a run of loose top-level
 * files sharing a stem) found directly under `legacyDir`. See
 * plans/plan.md, "Migration script", for the two shapes handled:
 *   - subfolder  -> the whole subfolder is one documentGroup, pages come
 *                   from files inside it, sequenceIndex from each file's
 *                   own trailing 3-digit suffix, title/date from the
 *                   FOLDER name.
 *   - loose file -> grouped with siblings sharing the same stem (before the
 *                   trailing 3-digit run); ungrouped stems become
 *                   standalone one-page documents.
 *
 * `options.excludeNames` skips specific direct children (subfolder OR loose
 * file names) entirely — found necessary for Phase 2: some legacy folders
 * (e.g. Typoskript1/) contain subfolders that are exact-duplicate copies of
 * other top-level folders (Typoskript1/FM == F.M/), or individual loose
 * files that duplicate content filed elsewhere (see plans/plan.md, "Phase 2
 * data-quality resolution" for the specific cases found).
 *
 * `options.includePattern`, if given, restricts LOOSE top-level files (not
 * subfolders) to only those whose filename matches — used to split one
 * legacy folder's mixed content across multiple categories (e.g. "Briefe
 * Fotos/" contains letters, circulars, postcards, and telegrams that the
 * original site filed under different Historische Dokumente sub-categories;
 * this lets the migration run once per sub-category with a matching regex).
 */
export async function groupLegacyFolder(legacyDir, legacyFolderLabel, options = {}) {
  const { excludeNames, includePattern } = options;
  const entries = await readdir(legacyDir, { withFileTypes: true });
  const groups = [];

  // Normalize both sides before comparing: macOS/APFS readdir() returns
  // filenames in NFD (decomposed) form, e.g. "ü" as "u" + combining
  // diaeresis, while a name typed into categories.json is normally NFC
  // (precomposed) — visually identical but a different byte sequence, so a
  // raw Set.has() silently fails to exclude any name containing an umlaut.
  // Found via Phase 2's Albert Soesman fix: "Bücher", "Unveröffentliches",
  // and "Bio-dyn. Präparat" all slipped through an --exclude list that
  // listed them correctly.
  const normalizedExcludes = excludeNames
    ? new Set([...excludeNames].map((n) => n.normalize('NFC')))
    : null;
  const notExcluded = (name) => !normalizedExcludes || !normalizedExcludes.has(name.normalize('NFC'));
  const subfolders = entries.filter((e) => e.isDirectory() && notExcluded(e.name));
  const looseFiles = entries.filter(
    (e) =>
      e.isFile() &&
      isPdfLike(e.name) &&
      notExcluded(e.name) &&
      (!includePattern || includePattern.test(e.name)),
  );

  for (const dir of subfolders) {
    const dirPath = join(legacyDir, dir.name);
    const dirEntries = (await readdir(dirPath, { withFileTypes: true })).filter(
      (e) => e.isFile() && isPdfLike(e.name),
    );
    if (dirEntries.length === 0) continue;

    const pages = dirEntries
      .map((e) => toPageEntry(join(dirPath, e.name), e.name, dirEntries.length))
      .sort((a, b) => a.sequenceIndex - b.sequenceIndex);

    let parsed = parseFilenameOrFolderName(dir.name);

    // Some subfolders are named with a bare date and nothing else (e.g.
    // "090410/" containing "Osterfest001.pdf" ... "Osterfest022.pdf") — the
    // real descriptive title lives on the child filenames' shared stem, not
    // the folder name. Confirmed by direct inspection of
    // legacy/Webpage Uranos/Scholl Mathilde/090410/ during the pilot; not
    // documented in analysis.md, so don't assume it's the only such case.
    if (!parsed.isUndated && parsed.title === parsed.dateRaw) {
      const childStem = commonStem(dirEntries.map((e) => e.name));
      if (childStem) {
        parsed = { ...parsed, title: childStem };
      }
    }

    groups.push(buildGroup({ parsed, pages, legacyFolder: `${legacyFolderLabel}/${dir.name}` }));
  }

  // --- Loose top-level files ---
  // Two-pass grouping, deliberately conservative: a trailing 3-digit run is
  // only treated as a real page-sequence number when there's more than one
  // file sharing that stem, OR the lone file's number is "001" (the
  // convention this archive uses even for genuinely single-page items, e.g.
  // "Visitenkarte001.pdf"). Without this safeguard, a standalone file like
  // "...Scholl 1927.pdf" gets its trailing "927" misread as a page number
  // (title accidentally truncated to "...Scholl 1") — found during the
  // pilot run against Scholl Mathilde/, not a hypothetical.
  const candidateGroups = new Map(); // candidateStem -> [{fullPath, originalFilename, seq}]
  for (const file of looseFiles) {
    const { baseName } = normalizeExtension(file.name);
    const withoutExt = baseName.replace(/\.pdf$/i, '');
    const match = withoutExt.match(TRAILING_SEQUENCE_RE);
    const candidateStem = match ? match[1].trim() : withoutExt;
    const candidateSeq = match ? Number(match[2]) : 1;
    if (!candidateGroups.has(candidateStem)) candidateGroups.set(candidateStem, []);
    candidateGroups.get(candidateStem).push({
      fullPath: join(legacyDir, file.name),
      originalFilename: file.name,
      withoutExt,
      candidateSeq,
    });
  }

  const finalGroups = new Map(); // finalStem -> pages[]
  for (const [candidateStem, files] of candidateGroups) {
    const isRealSequence = files.length > 1 || files[0].candidateSeq === 1;
    for (const file of files) {
      const { isVerbatim } = normalizeExtension(file.originalFilename);
      if (isRealSequence) {
        addToGroup(finalGroups, candidateStem, {
          fullPath: file.fullPath,
          originalFilename: file.originalFilename,
          isVerbatim,
          sequenceIndex: file.candidateSeq,
        });
      } else {
        // Reject the split — treat the whole original name as its own
        // standalone one-page document rather than guessing.
        addToGroup(finalGroups, file.withoutExt, {
          fullPath: file.fullPath,
          originalFilename: file.originalFilename,
          isVerbatim,
          sequenceIndex: 1,
        });
      }
    }
  }

  for (const [stem, pages] of finalGroups) {
    pages.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
    const parsed = parseFilenameOrFolderName(stem);
    groups.push(buildGroup({ parsed, pages, legacyFolder: legacyFolderLabel }));
  }

  return groups;
}

function addToGroup(map, key, page) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(page);
}

/** If every filename shares the same stem before its trailing 3-digit sequence, returns that stem. */
function commonStem(filenames) {
  const stems = filenames.map((name) => {
    const { baseName } = normalizeExtension(name);
    const withoutExt = baseName.replace(/\.pdf$/i, '');
    const match = withoutExt.match(TRAILING_SEQUENCE_RE);
    return match ? match[1].trim() : null;
  });
  if (stems.some((s) => !s)) return null;
  const [first, ...rest] = stems;
  return rest.every((s) => s === first) ? first : null;
}

/**
 * Same conservative rule as the loose-file grouping above, applied within a
 * single subfolder: only trust the trailing 3-digit run as a page number
 * when there's more than one file in the folder, or the lone file's number
 * is "001".
 */
function toPageEntry(fullPath, originalFilename, siblingCount) {
  const { baseName, isVerbatim } = normalizeExtension(originalFilename);
  const withoutExt = baseName.replace(/\.pdf$/i, '');
  const match = withoutExt.match(TRAILING_SEQUENCE_RE);
  const candidateSeq = match ? Number(match[2]) : 1;
  const trustSplit = match && (siblingCount > 1 || candidateSeq === 1);
  return {
    fullPath,
    originalFilename,
    isVerbatim,
    sequenceIndex: trustSplit ? candidateSeq : 1,
  };
}

function buildGroup({ parsed, pages, legacyFolder }) {
  const isVerbatim = pages.some((p) => p.isVerbatim);
  const documentGroup = slugify(
    parsed.isUndated ? parsed.title : `${parsed.dateRaw}${parsed.dateSuffix ?? ''}-${parsed.title}`,
  );
  return {
    documentGroup,
    title: parsed.title,
    date: parsed.isUndated || !parsed.year ? null : formatIsoDate(parsed),
    dateRaw: parsed.dateRaw,
    dateSuffix: parsed.dateSuffix,
    isUndated: parsed.isUndated,
    place: parsed.place,
    isVerbatim,
    needsReview: parsed.needsReview,
    reviewReason: parsed.reviewReason,
    legacyFolder,
    pages,
  };
}

function formatIsoDate(parsed) {
  const mm = parsed.dateRaw.slice(2, 4);
  const dd = parsed.dateRaw.slice(4, 6);
  return `${parsed.year}-${mm}-${dd}`;
}
