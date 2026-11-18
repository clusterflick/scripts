// Fold transformed releases from before the seen registry began into it.
//
//   PAT=... node helpers/backfill-seen-registry.js <seen-registry.json> \
//     [--from=YYYYMMDD] [--to=YYYYMMDD] [--every=N] [--out=<directory>]
//
// The seen registry started on 10 August 2026. A film that finished its run
// before then never got an entry, so `departed` builds no page for it and every
// link to its old page - Search Console counted thousands - is a 404. This
// reads the older data-transformed releases with the registry's own
// `getPresent`, folds them oldest first with `buildRegistry`, and merges the
// result into the published registry with `mergeBackfill`
// (scripts/registry/index.js says why the two steps are separate).
//
// Get the published registry first:
//   curl -sSLO https://github.com/clusterflick/data-diffed/releases/latest/download/seen-registry.json
//
// What gets read:
//   --from   first day, inclusive. Defaults to the registry's release less its
//            retention window: anything older would be pruned on the next fold.
//   --to     last day, exclusive. Defaults to the earliest lastSeen in the
//            registry, the first day it already covers.
//   --every  one day in N that has a release (default 1). Each day reads only
//            its last release. A film is in every release from when a venue
//            lists it until its last performance, usually weeks, so a gap of a
//            few days mostly finds the same films for a fraction of the
//            download; a film listed for less than the gap can be missed.
//
// What gets written, to --out (default `backfill-registry/`):
//   present/<tag>.json   what each release contained, written as each finishes,
//                        so an interrupted run picks up where it stopped
//   seen-registry.json   the merged registry, to publish in place of the old
//   summary.json         what was read and what changed
//   backfill.log         everything the pipeline code logged on the way
//
// Every release is about 250 files and 18MB, so the run size is printed first.
// The registry's movies each cost a TheMovieDB fetch in the cache stage and a
// page in the site build, which is the budget the retention window protects -
// the summary says how many this adds.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readJSON, writeJSON, withRetry } = require("../common/utils");
const { downloadReleaseAssets } = require("../scripts/transform/get-releases");
const {
  RETENTION_DAYS,
  buildRegistry,
  getPresent,
  mergeBackfill,
  parseTagDate,
} = require("../scripts/registry");

const REPO = "clusterflick/data-transformed";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RETRY = { retries: 5, delayMs: 30_000, backoffFactor: 2 };

const args = process.argv.slice(2);
const option = (name) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const REGISTRY_PATH = args.find((arg) => !arg.startsWith("--"));
const OUT = option("out") ?? "backfill-registry";
const EVERY = Number(option("every") ?? 1);

if (!REGISTRY_PATH) {
  throw new Error(
    "Usage: node helpers/backfill-seen-registry.js <seen-registry.json> [--from=YYYYMMDD] [--to=YYYYMMDD] [--every=N] [--out=<directory>]",
  );
}
if (!Number.isInteger(EVERY) || EVERY < 1) {
  throw new Error(`--every must be a whole number of days, got "${EVERY}"`);
}
const parseDay = (name) => {
  const value = option(name);
  if (value === undefined) return undefined;
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`--${name} must be YYYYMMDD, got "${value}"`);
  }
  return value;
};

const dayOf = (time) =>
  new Date(time).toISOString().slice(0, 10).replace(/-/g, "");

const formatDuration = (ms) => {
  const minutes = Math.round(ms / 60_000);
  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

// The pipeline code logs every retry and fold. Kept, but in the log file
// rather than over the progress line.
const logPath = path.join(OUT, "backfill.log");
const quiet = () => {
  const original = console.log;
  console.log = (...parts) =>
    fs.appendFileSync(logPath, `${parts.join(" ")}\n`);
  return () => (console.log = original);
};

async function listTags(octokit) {
  const tags = [];
  for (let page = 1; ; page++) {
    const { data } = await withRetry(
      () => octokit.request(`GET /repos/${REPO}/tags`, { per_page: 100, page }),
      { ...RETRY, label: `List tags (page ${page})` },
    );
    tags.push(...data.map(({ name }) => name));
    if (data.length < 100) return tags;
  }
}

// One release per chosen day: that day's last, the most up to date.
function chooseReleases(tags, from, to) {
  const lastOfDay = new Map();
  for (const tag of tags.filter((tag) => parseTagDate(tag) !== null).sort()) {
    const day = tag.slice(0, 8);
    if (day >= from && day < to) lastOfDay.set(day, tag);
  }
  return [...lastOfDay.values()].filter((_, index) => index % EVERY === 0);
}

async function readRelease(octokit, tag) {
  const { data: release } = await withRetry(
    () => octokit.request(`GET /repos/${REPO}/releases/tags/{tag}`, { tag }),
    {
      ...RETRY,
      label: `Release ${tag}`,
      shouldRetry: (error) => error.status !== 404,
    },
  );
  if (release.assets.length === 0) {
    throw new Error(`Release ${tag} has no assets`);
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "backfill-"));
  try {
    await downloadReleaseAssets(release, directory);
    const { movies } = await getPresent(directory);
    return { release: tag, files: release.assets.length, movies };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  const registry = await readJSON(REGISTRY_PATH);
  const registryDate = parseTagDate(registry.metadata?.release);
  if (registryDate === null) {
    throw new Error(
      `${REGISTRY_PATH} has no readable metadata.release; is it a seen registry?`,
    );
  }
  const retentionDays = registry.metadata.retentionDays ?? RETENTION_DAYS;
  const earliestSeen = Object.values(registry.movies)
    .map(({ lastSeen }) => lastSeen)
    .sort()[0];

  const from =
    parseDay("from") ?? dayOf(registryDate - retentionDays * MS_PER_DAY);
  const to = parseDay("to") ?? earliestSeen.slice(0, 8);
  if (from >= to) {
    throw new Error(`Nothing to read: --from ${from} is not before --to ${to}`);
  }

  fs.mkdirSync(path.join(OUT, "present"), { recursive: true });
  fs.writeFileSync(logPath, "");

  const { Octokit } = await import("@octokit/core");
  const octokit = new Octokit({ auth: process.env.PAT });

  const releases = chooseReleases(await listTags(octokit), from, to);
  if (releases.length === 0) {
    throw new Error(`No ${REPO} releases between ${from} and ${to}`);
  }
  const done = (tag) => path.join(OUT, "present", `${tag}.json`);
  const pending = releases.filter((tag) => !fs.existsSync(done(tag)));

  console.log(
    `Registry ${registry.metadata.release}: ${Object.keys(registry.movies).length} movies, earliest seen ${earliestSeen}`,
  );
  console.log(
    `Reading ${from} to ${to}, one day in ${EVERY}: ${releases.length} releases, ${releases.length - pending.length} already read, ${pending.length} to download (~${Math.round(pending.length * 18)}MB)`,
  );

  const started = Date.now();
  const restore = quiet();
  try {
    for (const [index, tag] of pending.entries()) {
      const elapsed = Date.now() - started;
      const eta =
        index > 0
          ? `, ~${formatDuration((elapsed / index) * (pending.length - index))} left`
          : "";
      process.stdout.write(
        `\r  ${index + 1}/${pending.length} ${tag}${eta}`.padEnd(60),
      );

      const { files, movies } = await readRelease(octokit, tag);
      await writeJSON(done(tag), {
        release: tag,
        files,
        // null, not undefined: JSON drops an undefined key, and with it a
        // film that was listed without any performance times.
        movies: Object.fromEntries(
          [...movies].map(([id, time]) => [id, time ?? null]),
        ),
      });
    }
  } finally {
    restore();
  }
  if (pending.length > 0) {
    process.stdout.write(
      `\r  ${pending.length} releases read in ${formatDuration(Date.now() - started)}`.padEnd(
        60,
      ) + "\n",
    );
  }

  // Oldest first, so lastSeen only ever moves forward.
  let backfill;
  const restoreFold = quiet();
  try {
    for (const tag of releases) {
      const { movies } = await readJSON(done(tag));
      backfill = buildRegistry({
        present: new Map(
          Object.entries(movies).map(([id, time]) => [id, time ?? undefined]),
        ),
        previousRegistry: backfill,
        release: tag,
        retentionDays,
      });
    }
  } finally {
    restoreFold();
  }

  const merged = mergeBackfill({ registry, backfill, retentionDays });
  await writeJSON(path.join(OUT, "seen-registry.json"), merged.registry);

  const before = Object.keys(registry.movies).length;
  const after = Object.keys(merged.registry.movies).length;
  const summary = {
    registryRelease: registry.metadata.release,
    from,
    to,
    every: EVERY,
    releasesRead: releases.length,
    firstRelease: releases[0],
    lastRelease: releases[releases.length - 1],
    moviesFound: Object.keys(backfill.movies).length,
    moviesBefore: before,
    moviesAfter: after,
    added: merged.added,
    lastPerformanceImproved: merged.improved,
    expired: merged.expired,
  };
  await writeJSON(path.join(OUT, "summary.json"), summary);

  console.log(
    `Found ${summary.moviesFound} movies; added ${merged.added} departed (${before} -> ${after}), ${merged.improved} given a later last performance, ${merged.expired} past retention`,
  );
  console.log(`Wrote ${path.join(OUT, "seen-registry.json")} and summary.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
