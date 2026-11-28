// Measure what checking a lone search result against the description's crew
// hints changes, before it ships.
//
//   node helpers/measure-hinted-crew-check.js [--retrieved=<dir>]
//     [--published=<dir>] [--out=<dir>] [--limit=N]
//
// When a TheMovieDB search left one candidate, getBestMatch took it on its
// title unless the listing's own director or cast fields named someone. Names
// pulled from the description (`matchingHints.crew`) were not checked, so
// ArtHouse Crouch End's "Saddled - Short Film - UK Première", "the first short
// film by Ruben Giovannoni", was matched to Brian Kamerer's 2023 feature. Now a
// lone candidate whose credits name none of those people is not taken on its
// title, and the search carries on to the reviewer - see
// takeOnlyResultIfCrewMatches in common/get-movie-data.js.
//
// The hints are any names in the description, so the risk is a right match
// declined because the description named a guest or a producer, and then not
// recovered by the reviewer. This finds every listing the check declined and
// what the search settled on instead, beside what was published, so a person
// can say which were right.
//
// Pull a retrieved release and the transformed release made from it - the
// same day's, so the published column describes the same listings:
//   ./helpers/get-latest-retrieved-data.sh
//   ./helpers/get-latest-transformed-data.sh
//
// Needs MOVIEDB_API_KEY, and the LLM keys: a declined listing goes on to the
// reviewer and the LLM search exactly as it would in a transform. Only venues
// are read - each one's own transform, with no sourced events - so listings
// that reach a venue only through a source, and films identified inside shorts
// programmes, are not covered.
//
// Writes one file per venue to --out as it finishes, then summary.json and
// declined.csv, the declined rows for labelling.

const fs = require("node:fs");
const path = require("node:path");
const {
  readJSON,
  writeJSON,
  getMovieTitleAndYearFrom,
} = require("../common/utils");
const normalizeTitle = require("../common/normalize-title");
const {
  searchForBestMatch,
  getMovieInfoAndCacheResults,
} = require("../common/get-movie-data");
const { getAllCinemaNames, getCinema } = require("../cinemas");
const {
  NEEDS_SOURCED_EVENTS,
} = require("../scripts/retrieve/check-retrieved-data");

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=")[1] : fallback;
};
const RETRIEVED = argValue("retrieved", "retrieved-data");
const PUBLISHED = argValue("published", "transformed-data");
const OUT = argValue("out", "hinted-crew-check");
const LIMIT = Number(argValue("limit", Infinity));

// The line takeOnlyResultIfCrewMatches logs when it declines a candidate
const DECLINED = /^ - Not taking (\d+) "(.*)" for "(.*)" on its title alone/;

// Only these listings can be affected: with a director or cast field of its
// own, a lone candidate was already checked against them.
const isInScope = (movie) =>
  movie.matchingHints?.crew?.length > 0 &&
  movie.overview.directors.length === 0 &&
  movie.overview.actors.length === 0;

const realLog = console.log;
const realWarn = console.warn;
let captured = [];
const quiet = () => {
  console.log = (...parts) => captured.push(parts.join(" "));
  console.warn = () => {};
};
const loud = () => {
  console.log = realLog;
  console.warn = realWarn;
};

const formatDuration = (ms) => {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`;
};

function progress(done, total, start, label) {
  const elapsed = Date.now() - start;
  const eta =
    done > 0
      ? ` - ~${formatDuration((elapsed / done) * (total - done))} left`
      : "";
  process.stdout.write(
    `\r\x1b[K${done}/${total} listings${eta} - ${label}`.slice(0, 160),
  );
}

async function describeCandidate(id) {
  const info = await getMovieInfoAndCacheResults({ id });
  return {
    id,
    title: info.title,
    year: info.release_date?.slice(0, 4),
    runtime: info.runtime,
    directors: (info.credits?.crew || [])
      .filter(({ job }) => job === "Director")
      .map(({ name }) => name),
  };
}

async function readPublished(location) {
  const file = path.join(PUBLISHED, location);
  if (!fs.existsSync(file)) return null;
  const listings = await readJSON(file);
  return new Map(listings.map((m) => [m.showingId, m.themoviedb]));
}

async function main() {
  if (!process.env.MOVIEDB_API_KEY) {
    throw new Error("MOVIEDB_API_KEY is not set");
  }
  if (!fs.existsSync(RETRIEVED)) {
    throw new Error(
      `No such directory "${RETRIEVED}". Pull it first: ./helpers/get-latest-retrieved-data.sh`,
    );
  }

  const venues = getAllCinemaNames().filter(
    (name) =>
      fs.existsSync(path.join(RETRIEVED, name)) && !NEEDS_SOURCED_EVENTS[name],
  );

  // Parse every venue first, so the size of the job is known before any
  // TheMovieDB or LLM call is made
  const work = [];
  let parsed = 0;
  quiet();
  for (const location of venues) {
    const data = JSON.parse(
      fs.readFileSync(path.join(RETRIEVED, location), "utf8"),
    );
    const movies = await getCinema(location).transform(data, {});
    parsed += movies.length;
    const inScope = movies.filter(isInScope);
    if (inScope.length > 0) work.push({ location, movies: inScope });
  }
  loud();

  const total = Math.min(
    LIMIT,
    work.reduce((sum, { movies }) => sum + movies.length, 0),
  );
  realLog(
    `${venues.length} venues, ${parsed} listings, ${total} with crew hints and no director or cast of their own - one match each`,
  );
  fs.mkdirSync(OUT, { recursive: true });

  const start = Date.now();
  let done = 0;
  const summary = { listings: total, declined: 0, outcomes: {} };
  const declinedRows = [];

  for (const { location, movies } of work) {
    if (done >= total) break;
    const published = await readPublished(location);
    const rows = [];

    for (const movie of movies) {
      if (done >= total) break;
      progress(done, total, start, `${location}: ${movie.title}`);

      const title = normalizeTitle(movie.title, { retainYear: true });
      const { title: normalizedTitle, year } = getMovieTitleAndYearFrom(title);
      captured = [];
      quiet();
      let match;
      try {
        match = await searchForBestMatch({
          normalizedTitle,
          movie,
          year: year || movie.overview.year,
        });
      } finally {
        loud();
      }

      const declinedIds = [
        ...new Set(
          captured
            .map((line) => line.match(DECLINED))
            .filter(Boolean)
            .map(([, id]) => Number(id)),
        ),
      ];

      const publishedMatch = published
        ? (published.get(movie.showingId) ?? null)
        : undefined;
      const row = {
        location,
        showingId: movie.showingId,
        title: movie.title,
        url: movie.url,
        hintedCrew: movie.matchingHints.crew,
        venueDuration: movie.overview.duration
          ? Math.round(movie.overview.duration / 60000)
          : null,
        description: movie.matchingHints.overview?.slice(0, 400) ?? null,
        published:
          publishedMatch === undefined
            ? "no published file for this venue"
            : publishedMatch && {
                id: publishedMatch.id,
                title: publishedMatch.title,
              },
        now: match ? { id: match.id, title: match.title } : null,
        declined: [],
      };
      for (const id of declinedIds) {
        row.declined.push(await describeCandidate(id));
      }

      if (row.declined.length > 0) {
        const outcome = !match
          ? "declined, now unmatched"
          : declinedIds.includes(match.id)
            ? "declined, reviewer chose it anyway"
            : "declined, matched to something else";
        row.outcome = outcome;
        summary.declined++;
        summary.outcomes[outcome] = (summary.outcomes[outcome] || 0) + 1;
        declinedRows.push(row);
      }
      rows.push(row);
      done++;
    }

    await writeJSON(path.join(OUT, `${location}.json`), rows);
  }
  progress(done, total, start, "done");
  process.stdout.write("\n");

  summary.elapsed = formatDuration(Date.now() - start);
  await writeJSON(path.join(OUT, "summary.json"), summary);

  const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const header = [
    "label (right to decline? yes/no)",
    "outcome",
    "venue",
    "title",
    "url",
    "hinted crew",
    "venue minutes",
    "declined candidate",
    "its directors",
    "its minutes",
    "published",
    "now",
    "description",
  ];
  const lines = declinedRows.map((row) =>
    [
      "",
      row.outcome,
      row.location,
      row.title,
      row.url,
      row.hintedCrew.join("; "),
      row.venueDuration,
      row.declined.map((c) => `${c.id} ${c.title} (${c.year})`).join("; "),
      row.declined.map((c) => c.directors.join(", ")).join("; "),
      row.declined.map((c) => c.runtime).join("; "),
      row.published?.id
        ? `${row.published.id} ${row.published.title}`
        : JSON.stringify(row.published),
      row.now ? `${row.now.id} ${row.now.title}` : "",
      row.description,
    ]
      .map(csvCell)
      .join(","),
  );
  fs.writeFileSync(
    path.join(OUT, "declined.csv"),
    [header.map(csvCell).join(","), ...lines].join("\n"),
  );

  realLog(
    `${summary.declined} of ${total} declined on crew hints (${summary.elapsed})`,
  );
  for (const [outcome, count] of Object.entries(summary.outcomes)) {
    realLog(`  ${count} ${outcome}`);
  }
  realLog(
    `Per-venue rows in ${OUT}/, declined rows to label in ${OUT}/declined.csv`,
  );
}

main().catch((error) => {
  loud();
  console.error(error);
  process.exit(1);
});
