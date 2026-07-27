// Known place names that appear throughout the archive (Steiner's lecture
// tour cities). Only used to disambiguate the trailing text after a date
// token — e.g. "080522b Hamburg" (place) vs. "140411b Homunkulus" (a topic
// title, NOT a place, despite having the same shape) — analysis.md and the
// Phase 1 design review both flagged this ambiguity explicitly. We only
// treat the trailing text as a place when it's an EXACT match; anything
// else stays part of the title rather than being guessed at.
const KNOWN_PLACES = new Set(
  [
    'Berlin', 'Hamburg', 'München', 'Munchen', 'Wien', 'Stuttgart', 'Köln', 'Koln',
    'Zürich', 'Zurich', 'Basel', 'Bern', 'Dornach', 'Leipzig', 'Hannover',
    'Kassel', 'Cassel', 'Karlsruhe', 'Nürnberg', 'Nurnberg', 'Prag',
    'Den Haag', 'Helsingfors', 'Kristiana', 'Stockholm', 'Norrköping',
    'Norrkoping', 'Norköpping', 'Bergen', 'London',
  ].map((p) => p.toLowerCase()),
);

const YEAR_MIN = 1880;
const YEAR_MAX = 1950;

// "140411b Homunkulus", "080522b Hamburg", "071018" (no suffix, no trailing text)
const DATE_PREFIX_RE = /^(\d{6})(ff)?([a-z])?[\s-]*(.*)$/i;
// A leading numeric run that ISN'T exactly 6 digits is a likely typo/malformed
// date attempt worth flagging rather than silently treating as a plain title.
const SUSPICIOUS_LEADING_DIGITS_RE = /^(\d{5}|\d{7,})\b/;
const UNDATIERT_RE = /^undatiert[\s-]*(.*)$/i;
const TRAILING_PARENTHETICAL_RE = /^(.*?)\s*\(([^()]+)\)\s*$/;

/**
 * Parses a filename/foldername *stem* (no extension, no trailing page
 * sequence number — that's stripped separately in group-pages.mjs) into
 * structured date/place/title fields.
 *
 * Deliberately conservative: only claims a `date` when a clean 6-digit
 * token is found, only claims a `place` on an exact known-place match, and
 * sets `needsReview: true` rather than guessing when the input looks like a
 * malformed date attempt. A stem with no date-like prefix at all (e.g.
 * "Notizen", "Handarbeit") is NOT an error — it's the normal shape for
 * undated personal notes/photos/postcards in this archive (confirmed by
 * direct inspection of legacy/Webpage Uranos/Keyserlingk Notizen/).
 */
export function parseFilenameOrFolderName(stem) {
  const trimmed = stem.trim();

  const dateMatch = trimmed.match(DATE_PREFIX_RE);
  if (dateMatch) {
    const [, dateRaw, ffMarker, letterSuffix, rawRemainder] = dateMatch;
    const yy = Number(dateRaw.slice(0, 2));
    const year = 1900 + yy;
    const yearOutOfRange = year < YEAR_MIN || year > YEAR_MAX;

    const { title: cleanedRemainder, attribution } = stripTrailingParenthetical(rawRemainder);
    const isKnownPlace = KNOWN_PLACES.has(cleanedRemainder.trim().toLowerCase());

    return {
      isUndated: false,
      dateRaw,
      year: yearOutOfRange ? null : year,
      dateSuffix: letterSuffix ?? undefined,
      isContinuation: Boolean(ffMarker),
      place: isKnownPlace ? cleanedRemainder.trim() : undefined,
      title: cleanedRemainder.trim() || dateRaw, // fall back to the raw date if nothing else
      attribution,
      needsReview: yearOutOfRange,
      reviewReason: yearOutOfRange
        ? `Parsed year ${year} from "${dateRaw}" is outside the expected ${YEAR_MIN}-${YEAR_MAX} range`
        : undefined,
    };
  }

  const undatiertMatch = trimmed.match(UNDATIERT_RE);
  if (undatiertMatch) {
    const { title, attribution } = stripTrailingParenthetical(undatiertMatch[1]);
    return {
      isUndated: true,
      dateRaw: undefined,
      year: null,
      dateSuffix: undefined,
      isContinuation: false,
      place: undefined,
      title: title.trim() || 'Undatiert',
      attribution,
      needsReview: false,
      reviewReason: undefined,
    };
  }

  // No date-like prefix at all — the normal, expected shape for undated
  // notes/photos/postcards (see Keyserlingk Notizen/ for real examples).
  const suspicious = SUSPICIOUS_LEADING_DIGITS_RE.test(trimmed);
  const { title, attribution } = stripTrailingParenthetical(trimmed);
  return {
    isUndated: true,
    dateRaw: undefined,
    year: null,
    dateSuffix: undefined,
    isContinuation: false,
    place: undefined,
    title: title.trim() || stem,
    attribution,
    needsReview: suspicious,
    reviewReason: suspicious
      ? `Leading digit run in "${trimmed}" doesn't match the expected 6-digit YYMMDD date shape`
      : undefined,
  };
}

function stripTrailingParenthetical(text) {
  const match = text.match(TRAILING_PARENTHETICAL_RE);
  if (!match) return { title: text, attribution: undefined };
  return { title: match[1], attribution: match[2] };
}
