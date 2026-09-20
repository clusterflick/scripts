// Compare Jev against the categories a release actually shipped, across every
// venue held locally.
//
//   node helpers/categorisation-coverage-report.js [--out=<path>]
//
// Where compare-categorisers.js answers "how do these two differ on a handful
// of venues I chose", this answers "what would change if we flipped the
// switch". It runs every venue present in both retrieved-data and
// transformed-data, so with a full download it is complete coverage of the
// listings that reach the categoriser rather than a sample.
//
// It reports disagreement, not correctness. Nothing here knows which answer is
// right - the published category is the incumbent's opinion, not truth. What
// it is for is blast radius: how many listings change, in which direction, and
// whether any venue shifts wholesale in a way that looks like a bug rather
// than a judgement. Adjudicating a disagreement is what
// write-categorisation-worksheet.js and the label fixture are for.
//
// Pull the data first - both sides, from the same release cycle:
//   ./helpers/get-latest-retrieved-data-for.sh <venue-id>
//   ./helpers/get-latest-transformed-data-for.sh <venue-id>
//
// Pull the sources' retrieved-data too (eventbrite.co.uk, dice.fm, ...). They
// are read from disk like any other venue, and a venue whose listings arrive
// through a source will come up short without them.

const fs = require("node:fs");
const path = require("node:path");
const { readJSON, writeJSON } = require("../common/utils");
const { getCinema } = require("../cinemas");
const askJevToCategorise = require("../common/ask-jev-to-categorise");
const getSourcedEventsFor = require("../scripts/transform/get-sourced-events-for");
const { getLlmUsageLog } = require("../common/llm-usage-log");
const { estimateCostUsd } = require("../common/llm-pricing");

const outArg = process.argv.slice(2).find((arg) => arg.startsWith("--out="));
const OUT_PATH = outArg
  ? outArg.split("=")[1]
  : path.join(process.cwd(), "categorisation-coverage.json");

const dataPath = (directory, location) =>
  path.join(process.cwd(), directory, location);

const listVenues = () => {
  const retrieved = new Set(fs.readdirSync(dataPath("retrieved-data", "")));
  return fs
    .readdirSync(dataPath("transformed-data", ""))
    .filter((venue) => retrieved.has(venue) && !venue.startsWith("."))
    .sort();
};

async function runVenue(location) {
  const retrieved = await readJSON(dataPath("retrieved-data", location));
  const published = await readJSON(dataPath("transformed-data", location));
  const { transform, attributes } = getCinema(location);

  // Sourced events are included. Every source's findEvents reads its own
  // retrieved-data asset and makes no network calls, so this costs a download
  // of the source assets rather than a live scrape of twenty ticketing
  // platforms - and without it, every listing that reaches a venue via
  // Eventbrite and friends is missing from the comparison.
  const sourcedEvents = await getSourcedEventsFor(attributes);
  const replayed = await transform(retrieved, sourcedEvents ?? {});
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
    // Both categorisers short-circuit identically above this point, so these
    // rows would agree by construction and only inflate the totals.
    if (record.themoviedb || !movie.matchingHints) continue;

    const jev = await askJevToCategorise(movie);
    rows.push({
      showingId: movie.showingId,
      venue: location,
      title: movie.title,
      llm: record.category,
      jev: jev.category,
      confidence: Number(jev.jev.confidence.toFixed(3)),
    });
  }

  return { rows, unjoined, replayed: replayed.length };
}

function report(rows, venueStats) {
  const disagreed = rows.filter((row) => row.llm !== row.jev);

  console.log(`\n=== coverage ===`);
  console.log(` - venues run:        ${venueStats.ran}`);
  console.log(` - venues failed:     ${venueStats.failed.length}`);
  console.log(` - listings replayed: ${venueStats.replayed}`);
  console.log(` - reached the categoriser: ${rows.length}`);
  console.log(` - did not join to the release: ${venueStats.unjoined}`);

  console.log(`\n=== agreement ===`);
  console.log(
    ` - agreed:    ${rows.length - disagreed.length} (${Math.round(((rows.length - disagreed.length) / rows.length) * 100)}%)`,
  );
  console.log(` - disagreed: ${disagreed.length}`);

  // The two directions mean different things and should never be summed. One
  // is the pipeline gaining a category it does not currently publish; the
  // other is it losing one.
  const recovered = disagreed.filter(
    (row) => row.llm === "event" && row.jev !== "event",
  );
  const surrendered = disagreed.filter(
    (row) => row.jev === "event" && row.llm !== "event",
  );
  console.log(
    `   - ${recovered.length} where the LLM published "event" and Jev has a category`,
  );
  console.log(
    `   - ${surrendered.length} where Jev publishes "event" and the LLM had a category`,
  );
  console.log(
    `   - ${disagreed.length - recovered.length - surrendered.length} where both name a category and they differ`,
  );

  console.log(`\n=== disagreement shapes (llm -> jev) ===`);
  const shapes = {};
  for (const row of disagreed) {
    const key = `${row.llm} -> ${row.jev}`;
    shapes[key] = (shapes[key] ?? 0) + 1;
  }
  for (const [shape, count] of Object.entries(shapes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)) {
    console.log(`  ${String(count).padStart(4)}  ${shape}`);
  }

  // A venue that disagrees on nearly everything is a different problem from
  // one that disagrees on a listing or two: it usually means the venue's
  // descriptions have a shape the criteria mishandle, which is worth a look
  // before any of the individual rows are.
  console.log(`\n=== venues by disagreement rate (10+ comparable rows) ===`);
  const byVenue = {};
  for (const row of rows) {
    byVenue[row.venue] = byVenue[row.venue] ?? { total: 0, differ: 0 };
    byVenue[row.venue].total++;
    if (row.llm !== row.jev) byVenue[row.venue].differ++;
  }
  Object.entries(byVenue)
    .filter(([, stat]) => stat.total >= 10)
    .map(([venue, stat]) => ({
      venue,
      ...stat,
      rate: stat.differ / stat.total,
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 12)
    .forEach((stat) =>
      console.log(
        `  ${String(Math.round(stat.rate * 100)).padStart(3)}%  ${String(stat.differ).padStart(3)}/${String(stat.total).padEnd(4)} ${stat.venue}`,
      ),
    );

  if (venueStats.failed.length > 0) {
    console.log(`\n=== venues that failed ===`);
    venueStats.failed.forEach(({ venue, message }) =>
      console.log(`  ${venue}: ${message}`),
    );
  }

  const usage = getLlmUsageLog().filter((record) => !record.cacheHit);
  const inputTokens = usage.reduce((t, r) => t + (r.promptTokens ?? 0), 0);
  console.log(`\n=== cost ===`);
  console.log(
    ` - jev calls: ${usage.length} (${rows.length - usage.length} cached)`,
  );
  if (usage.length > 0) {
    console.log(
      ` - estimated: $${estimateCostUsd("typesafe", "jev-latest", inputTokens, 0).toFixed(4)}`,
    );
  }
}

async function main() {
  const venues = listVenues();
  console.log(`Running ${venues.length} venues held locally...\n`);

  const rows = [];
  const stats = { ran: 0, failed: [], unjoined: 0, replayed: 0 };

  for (const venue of venues) {
    try {
      const result = await runVenue(venue);
      rows.push(...result.rows);
      stats.ran++;
      stats.unjoined += result.unjoined;
      stats.replayed += result.replayed;
      const differ = result.rows.filter((row) => row.llm !== row.jev).length;
      console.log(
        `  ${venue.padEnd(44)} ${String(result.rows.length).padStart(4)} rows, ${String(differ).padStart(3)} differ`,
      );
    } catch (error) {
      // One venue's stale data or changed transform should not lose the run.
      // Recorded and reported rather than swallowed.
      stats.failed.push({ venue, message: error.message.slice(0, 90) });
      console.log(`  ${venue.padEnd(44)} FAILED`);
    }
  }

  report(rows, stats);
  await writeJSON(OUT_PATH, {
    generatedAt: new Date().toISOString(),
    venues: stats.ran,
    rows,
  });
  console.log(
    `\nFull row-level output: ${path.relative(process.cwd(), OUT_PATH)}`,
  );
}

main();
