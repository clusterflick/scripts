// Compare the published LLM categories against Jev's, on real listings.
//
//   node helpers/compare-categorisers.js <venue-id> [<venue-id> ...] [--decomposed] [--limit=N]
//
// Only Jev is called. The LLM arm is already published: every release carries
// the category it decided, so re-running the provider to reproduce an answer
// we shipped would be paying for it twice.
//
// The one thing the release does not carry is the input. `matchingHints` holds
// the listing description the categoriser reads, and it is stripped at
// scripts/transform/index.js:341 before the output is validated, because
// schema.json is additionalProperties: false. So this replays each venue's own
// transform over its retrieved data to rebuild the state, then joins to the
// published record on `showingId` - which the venue transform assigns, so it
// is the same id on both sides.
//
// That join also stands in for the TMDB lookup: the published record already
// says whether the listing matched, so nothing here calls TheMovieDB either.
//
// Pull both inputs first, if stale or absent:
//   ./helpers/get-latest-retrieved-data-for.sh <venue-id>
//   ./helpers/get-latest-transformed-data-for.sh <venue-id>

const path = require("node:path");
const { readJSON } = require("../common/utils");
const { getCinema } = require("../cinemas");
const askJevToCategorise = require("../common/ask-jev-to-categorise");
const { getLlmUsageLog } = require("../common/llm-usage-log");
const { estimateCostUsd } = require("../common/llm-pricing");

const args = process.argv.slice(2);
const useDecomposedSignals = args.includes("--decomposed");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
const locations = args.filter((arg) => !arg.startsWith("--"));

if (locations.length === 0) {
  throw new Error(
    "No venue ids given. Usage: node helpers/compare-categorisers.js <venue-id> [...]",
  );
}

const dataPath = (directory, location) =>
  path.join(process.cwd(), directory, location);

const topThree = (row) =>
  Object.entries(row.probabilities)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([name, probability]) => `${name} ${probability.toFixed(2)}`)
    .join(", ");

// Speed and price are half the reason to be looking at Jev at all, so report
// them rather than taking the vendor's numbers on trust. Cache hits are
// excluded from the latency figure - a hit is a filesystem read and would
// flatter it to meaninglessness - and counted separately so a re-run is
// obviously a re-run.
function reportCost(rows) {
  const usage = getLlmUsageLog();
  const called = usage.filter((record) => !record.cacheHit);
  const hits = usage.length - called.length;

  const inputTokens = called.reduce(
    (total, record) => total + (record.promptTokens ?? 0),
    0,
  );
  const outputTokens = called.reduce(
    (total, record) => total + (record.candidatesTokens ?? 0),
    0,
  );
  const cost = estimateCostUsd(
    "typesafe",
    called[0]?.model ?? "jev-latest",
    inputTokens,
    outputTokens,
  );

  console.log(`\n=== cost ===`);
  console.log(` - calls: ${called.length} (${hits} served from cache)`);
  if (called.length === 0) return;
  console.log(
    ` - tokens: ${inputTokens} in, ${outputTokens} out (out is free)`,
  );
  console.log(
    ` - estimated: $${cost.toFixed(6)} total, $${(cost / called.length).toFixed(6)} per listing`,
  );

  // recordLlmUsage fires once per askJevToCategorise call and rows are built in
  // the same order, so index lines them up - which is how a row is known to
  // have gone to the network rather than to the cache.
  const latencies = rows
    .filter((_row, index) => usage[index] && !usage[index].cacheHit)
    .map((row) => row.elapsed)
    .sort((a, b) => a - b);
  if (latencies.length === 0) return;
  console.log(
    ` - latency: ${latencies[0]}ms fastest, ${latencies[Math.floor(latencies.length / 2)]}ms median, ${latencies[latencies.length - 1]}ms slowest`,
  );
}

// The gate is the only knob on this thing, and every row already carries the
// distribution needed to replay it, so there is no reason to guess at a value
// and re-run. Sweep it instead and let the corpus name the number.
//
// Read the columns together, not the agreement rate alone: "recovered" is rows
// where the LLM gave up and Jev has a category to offer, which is the whole
// argument for the swap and counts against agreement rather than for it.
function reportThresholdSweep(rows) {
  console.log(`\n=== confidence gate sweep ===`);
  console.log(`  gate   agrees   kept-but-wrong   recovered-from-event`);

  // Stepped as integers: accumulating 0.05 in floating point puts the eighth
  // step at 0.9000000000000001, which silently gates out a row sitting at
  // exactly 0.90 - the one value most likely to be on the boundary.
  for (let step = 40; step <= 95; step += 5) {
    const gate = step / 100;
    const decided = rows.map((row) => ({
      ...row,
      category: row.confidence >= gate ? row.jevRaw : "event",
    }));

    const agrees = decided.filter((row) => row.category === row.llm).length;
    // Kept a category the LLM disagreed with: the cost of lowering the gate.
    const keptButWrong = decided.filter(
      (row) => row.category !== "event" && row.category !== row.llm,
    ).length;
    // The LLM gave up and Jev did not: the benefit of lowering the gate.
    const recovered = decided.filter(
      (row) => row.llm === "event" && row.category !== "event",
    ).length;

    const marker =
      Math.abs(gate - askJevToCategorise.CONFIDENT) < 0.001
        ? "  <- current"
        : "";
    console.log(
      `  ${gate.toFixed(2)}   ${String(agrees).padStart(2)}/${rows.length}    ` +
        `${String(keptButWrong).padStart(6)}           ${String(recovered).padStart(6)}${marker}`,
    );
  }
}

async function getComparableMovies(location) {
  const { transform } = getCinema(location);

  const retrieved = await readJSON(dataPath("retrieved-data", location));
  const published = await readJSON(dataPath("transformed-data", location));

  // Sourced events are skipped: pulling them means scraping all nine source
  // platforms live. A venue whose listings come from a source will have fewer
  // rows to compare, which costs coverage rather than correctness - anything
  // that fails to join is reported below rather than silently dropped.
  const replayed = await transform(retrieved, {});

  const publishedById = new Map(
    (Array.isArray(published) ? published : Object.values(published)).map(
      (movie) => [movie.showingId, movie],
    ),
  );

  const unjoined = [];
  const comparable = [];

  for (const movie of replayed) {
    const record = publishedById.get(movie.showingId);
    if (!record) {
      unjoined.push(movie.showingId);
      continue;
    }

    // The rows worth comparing are the ones that actually reached the
    // categoriser. A TMDB match short-circuits to "movie" before either model
    // is asked, and a listing with no matchingHints short-circuits to "event".
    // Both modules agree on those by construction, so including them would
    // only inflate the agreement rate.
    if (record.themoviedb || !movie.matchingHints) continue;

    comparable.push({ movie, llmCategory: record.category });
  }

  // Nothing joining at all is not staleness, it is the venue's showingId
  // scheme having changed since the release was published - a platform
  // migration will do it. Say which, rather than reporting an empty comparison
  // as though there were simply nothing to compare.
  if (replayed.length > 0 && unjoined.length === replayed.length) {
    throw new Error(
      `No showingId in ${location} joined to the published release, so its id scheme has changed since that release. ` +
        `Replayed: "${replayed[0].showingId}". Published: "${[...publishedById.keys()][0]}". ` +
        `Re-download the transformed data, or compare a venue whose transform has not moved.`,
    );
  }

  return { comparable, unjoined, replayed: replayed.length };
}

async function main() {
  const rows = [];

  for (const location of locations) {
    console.log(`\n[🎞️  ${location}]`);
    const { comparable, unjoined, replayed } =
      await getComparableMovies(location);
    console.log(` - ${replayed} listings replayed from retrieved data`);
    console.log(` - ${comparable.length} reached the categoriser`);
    if (unjoined.length > 0) {
      console.log(
        ` - ⚠️  ${unjoined.length} did not join to the published release (stale data on one side, or sourced events)`,
      );
    }

    for (const { movie, llmCategory } of comparable.slice(0, limit)) {
      const start = Date.now();
      const jev = await askJevToCategorise(movie, { useDecomposedSignals });
      rows.push({
        location,
        title: movie.title,
        llm: llmCategory,
        jev: jev.category,
        jevRaw: jev.jev.category,
        confidence: jev.jev.confidence,
        probabilities: jev.jev.probabilities,
        signals: jev.jev.signals,
        elapsed: Date.now() - start,
      });
    }
  }

  if (rows.length === 0) {
    console.log("\nNothing to compare.");
    return;
  }

  const agreed = rows.filter((row) => row.llm === row.jev);
  const disagreed = rows.filter((row) => row.llm !== row.jev);

  console.log(`\n=== ${rows.length} compared ===`);
  console.log(
    ` - agreed:    ${agreed.length} (${Math.round((agreed.length / rows.length) * 100)}%)`,
  );
  console.log(` - disagreed: ${disagreed.length}`);

  // Shown separately because it is the cheapest thing to change. A row where
  // Jev picked the same category as the LLM and then discarded it for low
  // confidence is a threshold problem, not a model problem - CONFIDENT is
  // still at TypeSafe's suggested starting value.
  const gated = rows.filter(
    (row) => row.jev === "event" && row.jevRaw !== "event",
  );
  console.log(
    ` - held back by the ${askJevToCategorise.CONFIDENT} confidence gate: ${gated.length}` +
      (gated.length > 0
        ? ` (${gated.filter((row) => row.jevRaw === row.llm).length} of which Jev had chosen the LLM's answer)`
        : ""),
  );

  reportCost(rows);
  reportThresholdSweep(rows);

  // A gated row that happens to agree is still a gated row: the LLM said
  // "event" and Jev said "event" only because the gate overrode a real answer
  // underneath. Those never appear under disagreements, and they are where the
  // threshold is doing the most damage, so print every gated row here.
  if (gated.length > 0) {
    console.log(`\n=== held back by the confidence gate ===`);
    for (const row of gated) {
      console.log(
        `\n"${row.title}" (${row.location})\n` +
          `  llm: ${row.llm}  |  jev chose: ${row.jevRaw} at ${row.confidence.toFixed(2)}, published as event`,
      );
      console.log(`  top 3: ${topThree(row)}`);
    }
  }

  if (disagreed.length > 0) {
    console.log(`\n=== disagreements ===`);
    for (const row of disagreed) {
      console.log(`\n"${row.title}" (${row.location})`);
      console.log(`  llm: ${row.llm}`);
      console.log(
        `  jev: ${row.jev}${row.jevRaw !== row.jev ? ` (chose ${row.jevRaw}, confidence ${row.confidence.toFixed(2)})` : ` (confidence ${row.confidence.toFixed(2)})`}`,
      );
      console.log(`  top 3: ${topThree(row)}`);
      if (row.signals) {
        const signals = Object.entries(row.signals)
          .map(([name, value]) => `${name} ${value.toFixed(2)}`)
          .join(", ");
        console.log(`  signals: ${signals}`);
      }
    }
  }
}

main();
