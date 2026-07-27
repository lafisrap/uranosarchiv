const UMLAUT_MAP = {
  ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss',
};

/** German-aware slugify: transliterates umlauts before stripping diacritics, so "Präparat" -> "praeparat", not "praparat". */
export function slugify(input) {
  let s = String(input);
  for (const [from, to] of Object.entries(UMLAUT_MAP)) {
    s = s.replaceAll(from, to);
  }
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip remaining combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
