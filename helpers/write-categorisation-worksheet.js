// Produce a blind worksheet of listings to hand-label, and merge the results
// back into the label fixture.
//
//   node helpers/write-categorisation-worksheet.js <venue-id> [...]   # write worksheet
//   node helpers/write-categorisation-worksheet.js --merge            # merge labels in
//
// The worksheet is written WITHOUT either model's answer. Labelling while
// looking at what the models said anchors the result, and an anchored label is
// worth less than no label - the whole point of the fixture is that it was not
// produced by model behaviour.
//
// Agreement between two models says nothing about whether either is right, and
// the 243-listing run showed why that matters: among the programmes Jev
// collapsed into a single film is "La Raison Avant La Passion + A&B in
// Ontario", which runs 16 minutes and so cannot be "multiple-movies" under the
// 40-minutes-each rule the LLM was applying. The incumbent label is wrong
// there. Neither column can be treated as truth, so the disagreements have to
// be adjudicated by hand.
//
// Output goes to common/tests/categorisation-labels.json, which is tracked
// rather than sitting in one of the gitignored *-data directories: the labels
// are the expensive part and they outlive whatever is decided about Jev. Rows
// arrive with `label: null`; fill it in with the category that is actually
// right, or "unclear" where the listing genuinely does not say.
//
// Existing labels are preserved on re-run, keyed by showingId, so widening the
// corpus never costs work already done.

const path = require("node:path");
const { readJSON, writeJSON } = require("../common/utils");
const { getCinema } = require("../cinemas");
const askJevToCategorise = require("../common/ask-jev-to-categorise");

// The durable fixture. Only ever gains labelled rows - see its own `about`
// block for what it is and how to score against it.
const LABELS_PATH = path.join(
  process.cwd(),
  "common",
  "tests",
  "categorisation-labels.json",
);

// The scratch worksheet. Overwritten freely; holds nothing that is not either
// already in the fixture or regenerable from a release.
const WORKSHEET_PATH = path.join(
  process.cwd(),
  "common",
  "tests",
  "categorisation-sample.json",
);

async function mergeWorksheet() {
  const fixture = await readJSON(LABELS_PATH);
  const worksheet = await readJSON(WORKSHEET_PATH);

  const known = new Set(fixture.rows.map((row) => row.showingId));
  const added = worksheet.rows
    .filter((row) => row.label && !known.has(row.showingId))
    .map((row) => ({
      showingId: row.showingId,
      venue: row.venue,
      title: row.title,
      runtimeMinutes: row.runtimeMinutes ?? null,
      description: row.description,
      label: row.label,
      sample: worksheet.sample ?? "manual",
    }));

  if (added.length === 0) {
    throw new Error(
      `No new labelled rows in ${path.relative(process.cwd(), WORKSHEET_PATH)}. ` +
        `Fill in "label" on its rows first.`,
    );
  }

  fixture.rows.push(...added);
  await writeJSON(LABELS_PATH, fixture);
  console.log(`Merged ${added.length} labelled rows into the fixture.`);
  console.log(`It now holds ${fixture.rows.length}.`);
}

const args = process.argv.slice(2);
const isMerge = args.includes("--merge");
const locations = args.filter((arg) => !arg.startsWith("--"));

if (!isMerge && locations.length === 0) {
  throw new Error(
    "No venue ids given. Usage: node helpers/write-categorisation-worksheet.js <venue-id> [...] | --merge",
  );
}

async function collectDisagreements(location, labelled) {
  const { transform } = getCinema(location);
  const retrieved = await readJSON(
    path.join(process.cwd(), "retrieved-data", location),
  );
  const published = await readJSON(
    path.join(process.cwd(), "transformed-data", location),
  );

  const replayed = await transform(retrieved, {});
  const publishedById = new Map(
    (Array.isArray(published) ? published : Object.values(published)).map(
      (movie) => [movie.showingId, movie],
    ),
  );

  const disagreements = [];

  for (const movie of replayed) {
    const record = publishedById.get(movie.showingId);
    if (!record || record.themoviedb || !movie.matchingHints) continue;

    const jev = await askJevToCategorise(movie);

    // Compared against Jev's own choice rather than what the gate published.
    // A row the gate turned into "event" is a threshold question, and the
    // threshold cannot be set until it is known which choice was right.
    //
    // A row that now agrees is still kept when it carries a label: the label
    // says what the listing actually is, which does not stop being true
    // because two models have converged on it. Dropping those would quietly
    // destroy adjudication every time the criteria improve.
    const agrees = record.category === jev.jev.category;
    if (agrees && !labelled.has(movie.showingId)) continue;

    disagreements.push({
      agrees,
      showingId: movie.showingId,
      venue: location,
      title: movie.title,
      ...(movie.overview?.duration && {
        runtimeMinutes: Math.round(movie.overview.duration / 60000),
      }),
      description: movie.matchingHints.overview ?? null,
      llm: record.category,
      jev: jev.jev.category,
      jevConfidence: Number(jev.jev.confidence.toFixed(3)),
      jevProbabilities: Object.fromEntries(
        Object.entries(jev.jev.probabilities)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([name, probability]) => [name, Number(probability.toFixed(3))]),
      ),
      label: null,
    });
  }

  return disagreements;
}

async function main() {
  if (isMerge) return mergeWorksheet();

  const fixture = await readJSON(LABELS_PATH);
  const labelled = new Set(fixture.rows.map((row) => row.showingId));

  const rows = [];
  for (const location of locations) {
    console.log(`[🎞️  ${location}]`);
    const disagreements = await collectDisagreements(location, labelled);
    console.log(` - ${disagreements.length} unlabelled disagreements`);
    rows.push(...disagreements);
  }

  if (rows.length === 0) {
    console.log("\nNothing left to label in these venues.");
    return;
  }

  // Model answers are stripped here, not merely ignored: the file is meant to
  // be opened and edited by hand, and anything visible in it anchors.
  await writeJSON(WORKSHEET_PATH, {
    generatedAt: new Date().toISOString(),
    sample: "disagreement",
    note: 'Fill in "label" on each row, then run this script with --merge. One of: movie, multiple-movies, tv, shorts, quiz, comedy, music, talk, workshop, event. Use "either" when the listing is genuinely ambiguous, or "a|b" when more than one answer is acceptable.',
    rows: rows.map((row, index) => ({
      n: index + 1,
      showingId: row.showingId,
      venue: row.venue,
      title: row.title,
      runtimeMinutes: row.runtimeMinutes ?? null,
      description: row.description,
      label: null,
    })),
  });

  console.log(
    `\n${rows.length} rows written to ${path.relative(process.cwd(), WORKSHEET_PATH)}`,
  );
  console.log("Label them, then re-run with --merge.");
}

main();
