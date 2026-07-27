/**
 * Legacy filenames sometimes end in the literal (non-MIME) extension
 * ".pdf(wb)" — confirmed in analysis.md as a real, non-typo suffix, present
 * on ~206 files concentrated in E.S/ and F.M/. Strips it and reports whether
 * it was present, so callers can set `isVerbatim` accordingly.
 */
export function normalizeExtension(filename) {
  const wbMatch = filename.match(/^(.*\.pdf)\(wb\)$/i);
  if (wbMatch) {
    return { baseName: wbMatch[1], isVerbatim: true };
  }
  return { baseName: filename, isVerbatim: false };
}
