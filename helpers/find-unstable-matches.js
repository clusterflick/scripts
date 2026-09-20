// Find listings whose TheMovieDB match changed between published releases.
//
//   node helpers/find-unstable-matches.js [<directory>] [--out=<path>]
//
// A listing that matched one film yesterday and a different one today is
// wrong on at least one of those days, and nobody had to say which to know
// that. That makes instability a way to find bad matches without a labelled
// set - the releases disagree with each other, so the disagreement is the
// signal.
//
// The join is `showingId`, which the venue transform assigns from the venue's
// own event id, so it is the same id in every release the listing appears in.
// Unmatched listings are in `combined-data.json` too, carrying
// `isUnmatched: true` under an id hashed from their title, so a listing that
// stopped matching is visible here rather than simply absent.
//
// Pull the releases first - one per day, newest last:
//   ./helpers/get-last-10-days-combined-data.sh
//
// Reads `<directory>/<tag>/combined-data.json` as that script writes it, or a
// bare `<directory>/combined-data.json` from get-latest-combined-data.sh.
// Releases are ordered by their tag, which is the publish time; `generatedAt`
// inside the file is when the source data was pulled, which is a different
// thing and not monotonic across releases.
//
// What it does NOT tell you is which day was right, and it finds only matches
// that MOVED. A listing matched to the same wrong film every day looks exactly
// like a correct one from here. Three things also move a match without anyone
// having made a mistake, so read a row before believing it:
//
//   1. Our own edits. A new entry in `ignoredIds` or `forcedMatches`, or a
//      title-normalisation change, moves a match on purpose. The window
//      spans however many commits landed in it.
//   2. TheMovieDB. Entries get added, merged and deleted, and a search that
//      gains a better candidate overnight will legitimately return it. Edits
//      take hours to reach their CDN, so the same run can see either side.
//   3. The venue. A retitled listing keeps its showingId but changes the
//      input, which is what most of the `unmatched-churn` rows below are.
//
// Two populations come out of one pass, because the eval fixture wants both:
// the listings that moved, and the listings in the newest release that are
// categorised as a film but never matched at all.

const fs = require("node:fs");
const path = require("node:path");
const { readJSON, writeJSON } = require("../common/utils");

const args = process.argv.slice(2);
const outArg = args.find((arg) => arg.startsWith("--out="));
const OUT_PATH = outArg ? outArg.split("=")[1] : undefined;
const DIRECTORY = args.find((arg) => !arg.startsWith("--")) || "combined-data";

// A film the venue is showing that we could not identify. Every other category
// is expected to go unmatched - a quiz has no TheMovieDB entry to find.
//
// `multiple-movies` is excluded although it is films, because an unmatched
// programme is usually not a failure: a double bill matches each film on the
// bill into `themoviedbs` and is then keyed by a hash of its own title, since
// there is no single id to key it by. Counting those as misses overstated this
// number by 90 out of 244.
const FILM_CATEGORIES = new Set(["movie"]);

const KINDS = {
  rematched: "matched, then matched to a different TheMovieDB id",
  "match-dropped": "matched on some releases and unmatched on others",
  "unmatched-churn": "never matched; its hashed title id moved",
};

/**
 * Every release in the directory, oldest first. Accepts the per-tag layout
 * that get-last-10-days-combined-data.sh writes and the flat single file that
 * get-latest-combined-data.sh writes.
 */
function listReleases(directory) {
  if (!fs.existsSync(directory)) {
    throw new Error(
      `No such directory "${directory}". Pull the releases first: ./helpers/get-last-10-days-combined-data.sh`,
    );
  }

  const flat = path.join(directory, "combined-data.json");
  if (fs.existsSync(flat))
    return [{ tag: path.basename(directory), file: flat }];

  const releases = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      tag: entry.name,
      file: path.join(directory, entry.name, "combined-data.json"),
    }))
    .filter(({ file }) => fs.existsSync(file))
    .sort((a, b) => a.tag.localeCompare(b.tag));

  if (releases.length === 0) {
    throw new Error(
      `No combined-data.json found under "${directory}". Pull the releases first: ./helpers/get-last-10-days-combined-data.sh`,
    );
  }

  return releases;
}

/**
 * One pass over every release. Returns the per-showing history, a lookup from
 * TheMovieDB id to something a human can read, and the unmatched films in the
 * newest release.
 */
async function readReleases(releases) {
  // showingId -> [{ tag, movieId, isUnmatched, venueId, title, category }]
  const history = new Map();
  const movieMeta = new Map();
  let unmatchedFilms = [];

  for (const [index, { tag, file }] of releases.entries()) {
    const isNewest = index === releases.length - 1;
    const release = await readJSON(file);
    const unmatchedInRelease = [];

    for (const [movieId, movie] of Object.entries(release.movies)) {
      const isUnmatched = !!movie.isUnmatched;

      if (!isUnmatched && !movieMeta.has(movieId)) {
        movieMeta.set(movieId, {
          title: movie.title,
          releaseDate: movie.releaseDate,
        });
      }

      for (const [showingId, showing] of Object.entries(movie.showings ?? {})) {
        const entry = {
          tag,
          movieId,
          isUnmatched,
          venueId: showing.venueId,
          // A showing only carries its own title when it differs from the
          // movie's, so fall back rather than reporting it as absent.
          title: showing.title ?? movie.title,
          category: showing.category,
        };

        if (!history.has(showingId)) history.set(showingId, []);
        history.get(showingId).push(entry);

        if (isNewest && isUnmatched && FILM_CATEGORIES.has(showing.category)) {
          unmatchedInRelease.push({ showingId, ...entry });
        }
      }
    }

    if (isNewest) unmatchedFilms = unmatchedInRelease;
    console.log(
      ` - ${tag}: ${Object.keys(release.movies).length} movies, ${history.size} showings seen so far`,
    );
  }

  return { history, movieMeta, unmatchedFilms };
}

function classify(entries) {
  const unmatchedStates = new Set(entries.map((entry) => entry.isUnmatched));
  if (unmatchedStates.size > 1) return "match-dropped";
  return unmatchedStates.has(true) ? "unmatched-churn" : "rematched";
}

function findUnstable(history) {
  const unstable = [];

  for (const [showingId, entries] of history) {
    const movieIds = new Set(entries.map((entry) => entry.movieId));
    if (movieIds.size === 1) continue;

    unstable.push({
      showingId,
      venueId: entries[0].venueId,
      title: entries[entries.length - 1].title,
      category: entries[entries.length - 1].category,
      kind: classify(entries),
      releases: entries.map(({ tag, movieId, isUnmatched }) => ({
        tag,
        movieId,
        isUnmatched,
      })),
    });
  }

  return unstable.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.venueId.localeCompare(b.venueId) ||
      a.showingId.localeCompare(b.showingId),
  );
}

const countBy = (rows, getKey) =>
  rows.reduce((counts, row) => {
    const key = getKey(row);
    return { ...counts, [key]: (counts[key] ?? 0) + 1 };
  }, {});

const topEntries = (counts, limit) =>
  Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);

const describeMovie = (movieId, isUnmatched, movieMeta) => {
  if (isUnmatched) return "unmatched";
  const meta = movieMeta.get(movieId);
  if (!meta) return movieId;
  return `${movieId} ${meta.title}${meta.releaseDate ? ` (${meta.releaseDate.slice(0, 4)})` : ""}`;
};

function report(unstable, movieMeta, unmatchedFilms, totalShowings) {
  console.log(`\n=== instability ===`);
  console.log(` - ${totalShowings} distinct showings across the releases`);
  console.log(
    ` - ${unstable.length} changed their movie id (${((unstable.length / totalShowings) * 100).toFixed(1)}%)`,
  );

  for (const [kind, description] of Object.entries(KINDS)) {
    const rows = unstable.filter((row) => row.kind === kind);
    console.log(`\n--- ${kind}: ${rows.length} ---`);
    console.log(`    ${description}`);
    if (rows.length === 0) continue;
    const venues = topEntries(
      countBy(rows, (row) => row.venueId),
      8,
    );
    console.log(
      `    venues: ${venues.map(([venue, count]) => `${venue} (${count})`).join(", ")}`,
    );
  }

  // Printed in full, and only this kind: a listing that moved between two real
  // films is the one where a human can see the answer without re-running
  // anything, because both candidates are named right here.
  const rematched = unstable.filter((row) => row.kind === "rematched");
  if (rematched.length > 0) {
    console.log(`\n=== every rematched listing ===`);
    for (const row of rematched) {
      console.log(`\n ${row.showingId}  [${row.venueId}]`);
      console.log(`   "${row.title}" (${row.category})`);
      for (const { tag, movieId, isUnmatched } of row.releases) {
        console.log(
          `   ${tag}  ${describeMovie(movieId, isUnmatched, movieMeta)}`,
        );
      }
    }
  }

  console.log(`\n=== never matched, newest release ===`);
  console.log(
    ` - ${unmatchedFilms.length} showings categorised as a film with no TheMovieDB match`,
  );
  const byVenue = topEntries(
    countBy(unmatchedFilms, (row) => row.venueId),
    15,
  );
  for (const [venue, count] of byVenue) {
    console.log(`   ${String(count).padStart(4)}  ${venue}`);
  }
}

async function main() {
  const releases = listReleases(DIRECTORY);
  console.log(`Reading ${releases.length} release(s) from ${DIRECTORY}`);

  const { history, movieMeta, unmatchedFilms } = await readReleases(releases);
  const unstable = findUnstable(history);

  report(unstable, movieMeta, unmatchedFilms, history.size);

  if (OUT_PATH) {
    await writeJSON(OUT_PATH, {
      releases: releases.map(({ tag }) => tag),
      unstable,
      unmatchedFilms,
      // Only the ids named above, so the file stays readable and does not
      // become a stale copy of a release.
      movies: Object.fromEntries(
        [
          ...new Set(
            unstable.flatMap((row) => row.releases.map((r) => r.movieId)),
          ),
        ]
          .filter((movieId) => movieMeta.has(movieId))
          .map((movieId) => [movieId, movieMeta.get(movieId)]),
      ),
    });
    console.log(`\nWritten to ${OUT_PATH}`);
  }
}

main();
