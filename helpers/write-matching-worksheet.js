// Produce a blind worksheet of listings to hand-label with the film they are
// actually showing, and merge the results back into the label fixture.
//
//   node helpers/write-matching-worksheet.js <venue-id> [...] [--unstable=<path>] [--limit=N]
//   node helpers/write-matching-worksheet.js --merge
//
// The fixture this feeds is the baseline any change to TheMovieDB matching
// gets scored against - a different review model, a new tie-break, a
// normalisation rule. Without it the only available evidence is that an answer
// changed, which says nothing about whether it improved.
//
// Two populations are worth labelling, and both are already identified:
//
//   --unstable=<path>  The `--out` file from helpers/find-unstable-matches.js.
//                      Listings whose published match MOVED between releases,
//                      so at least one published answer was wrong and nobody
//                      had to say which to know that.
//   (default)          Listings the release categorised as a film and matched
//                      to nothing at all. Given both, rows from either are
//                      collected in one pass.
//
// Like the categorisation worksheet, rows are written WITHOUT the answer that
// shipped. That matters more here than there: the id a release published is a
// very plausible-looking number sitting next to a list of alternatives, and a
// label anchored to it measures the incumbent rather than the listing.
//
// Candidates come from the same title search `searchForBestMatch` runs first,
// under the same cache key, so a worksheet built the same day as a pipeline
// run costs no extra TheMovieDB calls. Runtime is looked up only for the
// candidates whose title matches, because that is the handful where it
// discriminates and the lookup is one call each.
//
// Pull both sides first, from the same release cycle:
//   ./helpers/get-latest-retrieved-data-for.sh <venue-id>
//   ./helpers/get-latest-transformed-data-for.sh <venue-id>
// and the sources' retrieved-data (eventbrite.co.uk, dice.fm, ...) - a venue
// whose listings arrive through a source loses its description without them,
// which is most of what a human labels from.

const fs = require("node:fs");
const path = require("node:path");
const {
  readJSON,
  writeJSON,
  getSearchSlug,
  getMovieTitleAndYearFrom,
} = require("../common/utils");
const normalizeTitle = require("../common/normalize-title");
const { getCinema } = require("../cinemas");
const {
  searchMovieAndCacheResults,
  getMovieInfoAndCacheResults,
} = require("../common/get-movie-data");
const getSourcedEventsFor = require("../scripts/transform/get-sourced-events-for");

// The durable fixture. Only ever gains labelled rows - see its own `about`
// block for what it is and how to score against it.
const LABELS_PATH = path.join(
  process.cwd(),
  "common",
  "tests",
  "matching-labels.json",
);

// The scratch worksheet. Overwritten freely; holds nothing that is not either
// already in the fixture or regenerable from a release.
const WORKSHEET_PATH = path.join(
  process.cwd(),
  "common",
  "tests",
  "matching-sample.json",
);

// A film the venue is showing that we should have been able to identify.
// Every other category is expected to go unmatched.
const FILM_CATEGORIES = new Set(["movie", "multiple-movies"]);

// Enough for a human to recognise the film without the file becoming a copy
// of TheMovieDB. The id is in the row; the full entry is one click away.
const OVERVIEW_CHARS = 400;
const MAX_CANDIDATES = 12;
const MAX_RUNTIME_LOOKUPS = 6;

const args = process.argv.slice(2);
const isMerge = args.includes("--merge");
const unstableArg = args.find((arg) => arg.startsWith("--unstable="));
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
const locations = args.filter((arg) => !arg.startsWith("--"));

if (!isMerge && locations.length === 0) {
  throw new Error(
    "No venue ids given. Usage: node helpers/write-matching-worksheet.js <venue-id> [...] | --merge",
  );
}

const dataPath = (directory, location) =>
  path.join(process.cwd(), directory, location);

async function mergeWorksheet() {
  const fixture = await readJSON(LABELS_PATH);
  const worksheet = await readJSON(WORKSHEET_PATH);

  const known = new Set(fixture.rows.map((row) => row.showingId));
  const added = worksheet.rows
    .filter((row) => row.correctId !== null && !known.has(row.showingId))
    .map((row) => ({
      showingId: row.showingId,
      venue: row.venue,
      title: row.title,
      year: row.year ?? null,
      runtimeMinutes: row.runtimeMinutes ?? null,
      classification: row.classification ?? null,
      // Carried even though the review step does not read them: a harness
      // that replays the whole of searchForBestMatch rather than just the
      // review does, and the fixture outlives the releases they came from.
      directors: row.directors ?? [],
      actors: row.actors ?? [],
      description: row.description,
      correctId: row.correctId,
      sample: row.sample,
    }));

  if (added.length === 0) {
    throw new Error(
      `No newly labelled rows in ${path.relative(process.cwd(), WORKSHEET_PATH)}. ` +
        `Fill in "correctId" on its rows first - a TheMovieDB id, "none", or "unclear".`,
    );
  }

  fixture.rows.push(...added);
  fixture.about.venues = [
    ...new Set([...fixture.about.venues, ...added.map((row) => row.venue)]),
  ].sort();

  await writeJSON(LABELS_PATH, fixture);
  console.log(`Merged ${added.length} labelled rows into the fixture.`);
  console.log(`It now holds ${fixture.rows.length}.`);
}

/**
 * The candidates `searchForBestMatch` would review, in the order it sees them.
 * Only the title search is replayed: the year-narrowed searches it runs first
 * need a year, and a listing that had a usable one mostly did not reach the
 * review step at all.
 */
async function getCandidates(normalizedTitle) {
  const slug = getSearchSlug(normalizedTitle);
  const search = await searchMovieAndCacheResults(
    `moviedb-search-title-no-year-${slug}`,
    { query: normalizedTitle },
  );

  const released = search.results
    .filter(({ release_date: date }) => !!date)
    .slice(0, MAX_CANDIDATES);

  // Runtime separates a feature from a same-named short, and a 1995 adaptation
  // from a 2026 one, more often than the overviews do. It is not in a search
  // result, so it costs a lookup - spent only on the candidates actually in
  // contention.
  const sameTitle = released.filter(
    (result) => normalizeTitle(result.title) === normalizedTitle,
  );
  const runtimes = new Map();
  for (const result of sameTitle.slice(0, MAX_RUNTIME_LOOKUPS)) {
    try {
      const info = await getMovieInfoAndCacheResults({ id: result.id });
      if (info.runtime) runtimes.set(result.id, info.runtime);
    } catch {
      // An entry the search still lists but the lookup 404s on has no runtime
      // to offer. The candidate stays on the worksheet without one.
    }
  }

  return released.map((result) => ({
    id: result.id,
    title: result.title,
    ...(result.original_title !== result.title && {
      originalTitle: result.original_title,
    }),
    year: result.release_date?.slice(0, 4) ?? null,
    ...(runtimes.has(result.id) && { runtimeMinutes: runtimes.get(result.id) }),
    overview: (result.overview ?? "").slice(0, OVERVIEW_CHARS) || null,
  }));
}

async function collectRows(location, { labelled, unstableIds }) {
  const { transform, attributes } = getCinema(location);

  // A source-only venue has no site to scrape, so its `retrieve` returns {}
  // and the release carries no asset for it - its listings arrive entirely
  // through the sources. Absent retrieved-data is therefore normal for those
  // and a missing download for anything else, and the two are told apart
  // below by whether the replay produced anything.
  const retrievedPath = dataPath("retrieved-data", location);
  const hasRetrieved = fs.existsSync(retrievedPath);
  const retrieved = hasRetrieved ? await readJSON(retrievedPath) : {};
  const published = await readJSON(dataPath("transformed-data", location));

  const sourcedEvents = await getSourcedEventsFor(attributes);
  const replayed = await transform(retrieved, sourcedEvents ?? {});

  if (replayed.length === 0 && !hasRetrieved) {
    throw new Error(
      `Replaying ${location} produced no listings and it has no retrieved-data. ` +
        `If it has a site, download it: ./helpers/get-latest-retrieved-data-for.sh ${location}. ` +
        `If it is source-only, its sources' retrieved-data is missing instead ` +
        `(eventbrite.co.uk, ticketsource.co.uk, designmynight.com, ...).`,
    );
  }

  const publishedById = new Map(
    (Array.isArray(published) ? published : Object.values(published)).map(
      (movie) => [movie.showingId, movie],
    ),
  );

  const rows = [];
  let unjoined = 0;

  for (const movie of replayed) {
    const record = publishedById.get(movie.showingId);
    if (!record) {
      unjoined++;
      continue;
    }
    if (labelled.has(movie.showingId)) continue;

    const wasUnstable = unstableIds.has(movie.showingId);
    const wasUnmatched =
      !record.themoviedb && FILM_CATEGORIES.has(record.category);
    if (!wasUnstable && !wasUnmatched) continue;

    const titleWithYear = normalizeTitle(movie.title, { retainYear: true });
    const { title: normalizedTitle } = getMovieTitleAndYearFrom(titleWithYear);

    console.log(` - "${movie.title}"`);
    const candidates = await getCandidates(normalizedTitle);

    rows.push({
      showingId: movie.showingId,
      venue: location,
      sample: wasUnstable ? "unstable" : "unmatched",
      title: movie.title,
      normalizedTitle,
      year: movie.overview?.year ?? null,
      runtimeMinutes: movie.overview?.duration
        ? Math.round(movie.overview.duration / 60000)
        : null,
      classification: movie.overview?.classification ?? null,
      directors: movie.overview?.directors ?? [],
      actors: movie.overview?.actors ?? [],
      description: movie.matchingHints?.overview ?? null,
      candidates,
      correctId: null,
    });

    if (rows.length >= limit) break;
  }

  // Nothing joining at all is not staleness, it is the venue's showingId
  // scheme having changed since the release was published. Say which, rather
  // than reporting an empty worksheet as though there were nothing to label.
  if (replayed.length > 0 && unjoined === replayed.length) {
    throw new Error(
      `No showingId in ${location} joined to the published release, so its id scheme has changed since that release. ` +
        `Replayed: "${replayed[0].showingId}". Published: "${[...publishedById.keys()][0]}". ` +
        `Re-download both sides from the same release cycle.`,
    );
  }

  return { rows, unjoined, replayed: replayed.length };
}

async function main() {
  if (isMerge) return mergeWorksheet();

  const fixture = await readJSON(LABELS_PATH);
  const labelled = new Set(fixture.rows.map((row) => row.showingId));

  let unstableIds = new Set();
  if (unstableArg) {
    const report = await readJSON(unstableArg.split("=")[1]);
    unstableIds = new Set(report.unstable.map((row) => row.showingId));
    console.log(`${unstableIds.size} unstable showings to look for\n`);
  }

  const rows = [];
  for (const location of locations) {
    console.log(`[🎞️  ${location}]`);
    const collected = await collectRows(location, { labelled, unstableIds });
    console.log(
      ` - ${collected.rows.length} to label, from ${collected.replayed} replayed` +
        (collected.unjoined > 0
          ? ` (${collected.unjoined} did not join to the release)`
          : ""),
    );
    rows.push(...collected.rows);
  }

  if (rows.length === 0) {
    console.log("\nNothing left to label in these venues.");
    return;
  }

  await writeJSON(WORKSHEET_PATH, {
    generatedAt: new Date().toISOString(),
    note: 'Set "correctId" on each row to the TheMovieDB id of the film actually being shown. The candidates are only what one search returned, and the pipeline runs several - so the right film is sometimes missing from the list, and a row can arrive with no candidates at all. When that happens, look the film up on TheMovieDB and put ITS id in, rather than settling for the closest option or writing it off. Those rows are the point: the harness reports a right answer the search never offered separately, because no reviewer can choose what it was not shown. Use "none" only when no TheMovieDB entry exists for the film, or the listing is not one identifiable film - a marathon, a mystery screening, a season pass. Use "unclear" when you cannot tell, and it will be left out of scoring rather than counted against anything. Then re-run with --merge.',
    rows: rows.map((row, index) => ({ n: index + 1, ...row })),
  });

  console.log(
    `\n${rows.length} rows written to ${path.relative(process.cwd(), WORKSHEET_PATH)}`,
  );
  console.log("Label them, then re-run with --merge.");
}

main();
