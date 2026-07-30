#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG_PATH = join(REPO_ROOT, 'scripts/config/categories.json');

function parseArgs(argv) {
  const args = { upload: false, force: false, skipNormalize: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--upload') args.upload = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--skip-normalize') args.skipNormalize = true;
    else if (arg === '--only') args.only = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

/**
 * Shells out to the existing single-category CLIs rather than importing
 * their internals — normalize/merge/migrate-category.mjs are each already
 * proven standalone tools (used throughout the pilot), and running them as
 * subprocesses means this batch runner can't accidentally diverge from
 * their tested CLI behavior (arg parsing, .env loading, exit codes).
 */
function run(script, args) {
  console.log(`\n$ node ${script} ${args.join(' ')}`);
  return execFileAsync('node', [join(REPO_ROOT, script), ...args], {
    cwd: REPO_ROOT,
    maxBuffer: 1024 * 1024 * 64,
  }).then(
    ({ stdout, stderr }) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
    },
    (err) => {
      if (err.stdout) process.stdout.write(err.stdout);
      if (err.stderr) process.stderr.write(err.stderr);
      throw err;
    },
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
  const entries = args.only ? config.filter((e) => e.categorySlug === args.only) : config;

  if (entries.length === 0) {
    throw new Error(args.only ? `No categories.json entry matches --only ${args.only}` : 'categories.json is empty.');
  }

  if (!args.skipNormalize) {
    // Runs once over the whole archive (not per-category) — the script
    // already recurses through every legacy folder and skips files it has
    // already normalized, so re-running it here is cheap and idempotent.
    await run('scripts/normalize-legacy-pdfs.mjs', []);
  } else {
    console.log('Skipping normalize-legacy-pdfs.mjs (--skip-normalize).');
  }

  console.log(`\nMigrating ${entries.length} categories.json entr${entries.length === 1 ? 'y' : 'ies'}…`);

  const failures = [];
  for (const entry of entries) {
    const extraFlags = [];
    for (const name of entry.exclude ?? []) extraFlags.push('--exclude', name);
    if (entry.includePattern) extraFlags.push('--include-pattern', entry.includePattern);

    console.log(`\n=== ${entry.legacyDir} -> ${entry.categorySlug} ===`);
    try {
      await run('scripts/merge-legacy-pdfs.mjs', [
        '--legacy-dir', entry.legacyDir,
        '--category-slug', entry.categorySlug,
        ...(args.force ? ['--force'] : []),
        ...extraFlags,
      ]);
      await run('scripts/migrate-category.mjs', [
        '--legacy-dir', entry.legacyDir,
        '--category-slug', entry.categorySlug,
        ...(args.upload ? ['--upload'] : []),
        ...(args.force ? ['--force'] : []),
        ...extraFlags,
      ]);
    } catch (err) {
      console.error(`✗ Failed: ${entry.legacyDir} -> ${entry.categorySlug}\n${err.message}`);
      failures.push(entry);
    }
  }

  console.log(`\nDone. ${entries.length - failures.length}/${entries.length} categories succeeded.`);
  if (failures.length > 0) {
    console.log('Failed:', failures.map((f) => `${f.legacyDir} -> ${f.categorySlug}`).join(', '));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
