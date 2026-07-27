// Public base URL for the R2 bucket holding the scanned PDFs.
// Default: R2's free `pub-<hash>.r2.dev` URL (no custom domain required —
// see plans/plan.md, "Cloudflare R2 integration"). Swappable to a custom
// domain later purely via this one env var, no code changes.
const base = import.meta.env.PUBLIC_R2_BASE_URL;

/** Builds the public URL for a given R2 object key (e.g. "scholl-mathilde/090410-osterfest/012.pdf"). */
export function r2Url(key: string): string {
  if (!base) {
    throw new Error(
      'PUBLIC_R2_BASE_URL is not set — add it to .env (see .env.example) or the GitHub Actions repo variable.',
    );
  }
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${base.replace(/\/$/, '')}/${encodedKey}`;
}
