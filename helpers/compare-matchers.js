// Score TheMovieDB matching against the hand-adjudicated fixture.
//
//   node helpers/compare-matchers.js [--releases=<dir>] [--run-llm] [--limit=N]
//
// Only Jev is called by default. The LLM arm is already published: every
// release carries the match it settled on, so re-running the provider to
// reproduce an answer we shipped would be paying for it twice. Point
// --releases at the combined-data directory and the published answer is read
// from there, joined on showingId.
//
// Reading several releases buys something one re-run could not. A match that
// moved has no single incumbent answer - Murder, My Sweet on six days and
// Farewell, My Lovely on four - so the LLM arm is scored as the share of
// releases it got right rather than as a coin flip. A row present in one
// release is scored on one release, and the count is printed so a 1/1 is not
// mistaken for a 10/10.
//
// The two columns are NOT the same experiment, and the report says so rather
// than averaging them into one number:
//
//   - The Jev column is the review step alone, asked to choose from the
//     candidate list.
//   - The published column is the whole of searchForBestMatch, of which the
//     review step is one of about eight paths to an answer. A row it got right
//     may never have reached a reviewer at all.
//
// So a disagreement is not automatically a regression, and the honest question
// this answers is "on the listings that were going wrong, does the Jev
// reviewer get them right". --run-llm adds a true like-for-like column by
// asking the incumbent reviewer the same question over the same candidates,
// which costs LLM calls and is off by default.
//
// Candidates are searched live rather than stored, because TheMovieDB
// reorders and edits results continuously and a frozen list stops describing
// anything real within days. That makes a wrong answer two different
// failures, and they are reported apart: the search never returning the right
// film is not something any reviewer can fix.
//
// Pull the releases first, if scoring the published column:
//   ./helpers/get-last-10-days-combined-data.sh

const fs = require("node:fs");
const path = require("node:path");
const {
  readJSON,
  getSearchSlug,
  getMovieTitleAndYearFrom,
  parseMinsToMs,
  runLlmFunction,
} = require("../common/utils");
const normalizeTitle = require("../common/normalize-title");
const { searchMovieAndCacheResults } = require("../common/get-movie-data");
const askJevToReviewResults = require("../common/ask-jev-to-review-results");
const askLlmToReviewResults = require("../common/ask-llm-to-review-results");

const LABELS_PATH = path.join(
  process.cwd(),
  "common",
  "tests",
  "matching-labels.json",
);

// The confidence the incumbent must self-report before its match is
// published. Mirrored from reviewResultsUsingLlm in common/get-movie-data.js
// so the --run-llm column scores what the pipeline would actually have used,
// not what the model merely preferred.
const LLM_CONFIDENCE_GATE = 8;

// Labels that are not an answer. "unclear" means a human could not settle it
// either, so counting it against a model measures the fixture, not the model.
const UNSCOREABLE = new Set(["unclear"]);
const NO_MATCH_LABEL = "none";

const args = process.argv.slice(2);
const releasesArg = args.find((arg) => arg.startsWith("--releases="));
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const runLlm = args.includes("--run-llm");
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

/**
 * The listing as the matcher would have received it, rebuilt from the fixture
 * row. The fixture is self-contained on purpose - the releases these came from
 * are long gone - so this is the only place the shape is reassembled.
 */
const toMovie = (row) => ({
  title: row.title,
  overview: {
    categories: [],
    directors: row.directors ?? [],
    actors: row.actors ?? [],
    ...(row.year && { year: row.year }),
    ...(row.classification && { classification: row.classification }),
    ...(row.runtimeMinutes && { duration: parseMinsToMs(row.runtimeMinutes) }),
  },
  ...(row.description && { matchingHints: { overview: row.description } }),
});

/** The candidates the review step is given, under the pipeline's cache key. */
async function getCandidates(row) {
  const titleWithYear = normalizeTitle(row.title, { retainYear: true });
  const { title: normalizedTitle } = getMovieTitleAndYearFrom(titleWithYear);
  const search = await searchMovieAndCacheResults(
    `moviedb-search-title-no-year-${getSearchSlug(normalizedTitle)}`,
    { query: normalizedTitle },
  );
  return {
    normalizedTitle,
    results: search.results.filter(({ release_date: date }) => !!date),
  };
}

/**
 * What every release said about this listing, newest last. A released match
 * is its TheMovieDB id as a string; a listing the release carried but never
 * matched counts as the no-match answer, which is a real answer and often the
 * right one.
 */
function readPublishedAnswers(releases, showingId) {
  const answers = [];
  for (const { tag, movies } of releases) {
    const found = movies.get(showingId);
    if (found) answers.push({ tag, answer: found });
  }
  return answers;
}

function loadReleases(directory) {
  const flat = path.join(directory, "combined-data.json");
  const files = fs.existsSync(flat)
    ? [{ tag: path.basename(directory), file: flat }]
    : fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          tag: entry.name,
          file: path.join(directory, entry.name, "combined-data.json"),
        }))
        .filter(({ file }) => fs.existsSync(file))
        .sort((a, b) => a.tag.localeCompare(b.tag));

  return files.map(({ tag, file }) => {
    const release = JSON.parse(fs.readFileSync(file, "utf8"));
    const movies = new Map();
    for (const [movieId, movie] of Object.entries(release.movies)) {
      const answer = movie.isUnmatched ? NO_MATCH_LABEL : movieId;
      for (const showingId of Object.keys(movie.showings ?? {})) {
        movies.set(showingId, answer);
      }
    }
    return { tag, movies };
  });
}

const isCorrect = (answer, correctId) =>
  answer !== undefined && String(answer) === String(correctId);

async function scoreRow(row, releases) {
  const { normalizedTitle, results } = await getCandidates(row);
  const movie = toMovie(row);

  const inCandidates =
    row.correctId === NO_MATCH_LABEL ||
    results.some((result) => String(result.id) === String(row.correctId));

  const jev = await askJevToReviewResults(movie, results, normalizedTitle);
  const jevAnswer = jev.match ? String(jev.match.id) : NO_MATCH_LABEL;

  let llmAnswer;
  if (runLlm) {
    const result = await runLlmFunction(() =>
      askLlmToReviewResults(movie, results, normalizedTitle),
    );
    const matched =
      result &&
      result.confidence >= LLM_CONFIDENCE_GATE &&
      results.find(({ id }) => id === result.match?.id);
    llmAnswer = matched ? String(matched.id) : NO_MATCH_LABEL;
  }

  const published = readPublishedAnswers(releases, row.showingId);
  const publishedCorrect = published.filter(({ answer }) =>
    isCorrect(answer, row.correctId),
  ).length;

  return {
    ...row,
    candidateCount: results.length,
    inCandidates,
    jevAnswer,
    jevConfidence: jev.confidence,
    jevFits: jev.fits,
    llmAnswer,
    publishedSeen: published.length,
    publishedCorrect,
    publishedAnswers: [...new Set(published.map(({ answer }) => answer))],
  };
}

function report(rows) {
  const scoreable = rows.filter((row) => !UNSCOREABLE.has(row.correctId));
  const skipped = rows.length - scoreable.length;

  console.log(`\n=== population ===`);
  console.log(` - ${rows.length} labelled rows`);
  if (skipped > 0) console.log(` - ${skipped} labelled "unclear", not scored`);

  // A row whose right answer was never in the candidate list is a retrieval
  // failure. No reviewer can choose what it was not shown, so scoring one
  // against these measures the search and calls it the model.
  const reachable = scoreable.filter((row) => row.inCandidates);
  const unreachable = scoreable.length - reachable.length;
  console.log(
    ` - ${unreachable} whose correct film was not in the search results (search misses, excluded below)`,
  );
  console.log(` - ${reachable.length} scoreable on the review step`);

  if (reachable.length === 0) {
    console.log(
      `\nNothing to score. Label rows with helpers/write-matching-worksheet.js first.`,
    );
    return;
  }

  const jevRight = reachable.filter((row) => row.jevAnswer === row.correctId);
  console.log(`\n=== jev (review step only) ===`);
  console.log(
    ` - correct: ${jevRight.length}/${reachable.length} (${Math.round((jevRight.length / reachable.length) * 100)}%)`,
  );

  const seen = reachable.filter((row) => row.publishedSeen > 0);
  if (seen.length > 0) {
    const releaseCount = seen.reduce(
      (total, row) => total + row.publishedSeen,
      0,
    );
    const releaseRight = seen.reduce(
      (total, row) => total + row.publishedCorrect,
      0,
    );
    console.log(`\n=== published (whole pipeline, as shipped) ===`);
    console.log(
      ` - correct on ${releaseRight}/${releaseCount} release-days across ${seen.length} rows`,
    );
    console.log(
      ` - rows right on every release: ${seen.filter((row) => row.publishedCorrect === row.publishedSeen).length}`,
    );
    console.log(
      ` - rows right on no release:    ${seen.filter((row) => row.publishedCorrect === 0).length}`,
    );
  }

  if (runLlm) {
    const llmRight = reachable.filter((row) => row.llmAnswer === row.correctId);
    console.log(`\n=== llm (review step only, like for like) ===`);
    console.log(
      ` - correct: ${llmRight.length}/${reachable.length} (${Math.round((llmRight.length / reachable.length) * 100)}%)`,
    );

    const both = reachable.filter(
      (row) =>
        row.jevAnswer === row.correctId && row.llmAnswer === row.correctId,
    ).length;
    const neither = reachable.filter(
      (row) =>
        row.jevAnswer !== row.correctId && row.llmAnswer !== row.correctId,
    ).length;
    console.log(`\n=== head to head ===`);
    console.log(` - both right:  ${both}`);
    console.log(` - jev only:    ${jevRight.length - both}`);
    console.log(
      ` - llm only:    ${reachable.filter((row) => row.llmAnswer === row.correctId).length - both}`,
    );
    console.log(` - both wrong:  ${neither}`);
  }

  const wrong = reachable.filter((row) => row.jevAnswer !== row.correctId);
  if (wrong.length === 0) return;

  console.log(`\n=== every row jev got wrong ===`);
  for (const row of wrong) {
    console.log(`\n ${row.showingId}  [${row.venue}]`);
    console.log(`   "${row.title}"`);
    console.log(
      `   correct ${row.correctId}, jev said ${row.jevAnswer} (confidence ${row.jevConfidence.toFixed(2)}, ${row.candidateCount} candidates)`,
    );
    if (row.publishedSeen > 0) {
      console.log(
        `   published ${row.publishedAnswers.join(" / ")} - right on ${row.publishedCorrect}/${row.publishedSeen} releases`,
      );
    }
    const fit = row.jevFits?.[row.correctId];
    if (fit !== undefined) {
      console.log(`   its noul for the correct film: ${fit.toFixed(2)}`);
    }
  }
}

async function main() {
  const fixture = await readJSON(LABELS_PATH);

  if (fixture.rows.length === 0) {
    console.log(
      `${path.relative(process.cwd(), LABELS_PATH)} holds no rows yet, so there is nothing to score.\n` +
        `Build a worksheet, label it, and merge it in:\n` +
        `  node helpers/write-matching-worksheet.js <venue-id> [...] --unstable=<report>\n` +
        `  node helpers/write-matching-worksheet.js --merge`,
    );
    return;
  }

  const releases = releasesArg ? loadReleases(releasesArg.split("=")[1]) : [];
  if (releasesArg) {
    console.log(`Read ${releases.length} release(s) for the published column`);
  }

  const rows = [];
  for (const row of fixture.rows.slice(0, limit)) {
    rows.push(await scoreRow(row, releases));
  }

  report(rows);
}

main();
