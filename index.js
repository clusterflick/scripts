#!/usr/bin/env node

const fs = require("node:fs").promises;
const path = require("node:path");
const { readJSON, writeJSON, sanitizePathSegment } = require("./common/utils");
const { getVersion } = require("./common/get-version");
const { getLlmUsageLog, clearLlmUsageLog } = require("./common/llm-usage-log");

const setupDirectory = async (type) => {
  const directoryPath = path.join(process.cwd(), type);
  let needsCreated = false;
  try {
    needsCreated = !(await fs.stat(directoryPath)).isDirectory();
  } catch (e) {
    needsCreated = e.code === "ENOENT";
  }
  if (needsCreated) await fs.mkdir(directoryPath, { recursive: true });
};

(async function () {
  const [, , action, location, ...parameters] = process.argv;

  console.log(`🏷️  scripts @ ${getVersion()}`);

  if (action.toLowerCase() === "combine") {
    const combine = require("./scripts/combine");
    const output = await combine();
    await setupDirectory("combined-data");
    await writeJSON(
      path.join(process.cwd(), "combined-data", "combined-data.json"),
      output,
    );
    return;
  }

  if (action.toLowerCase() === "match") {
    if (!location) throw new Error("No source provided");

    const match = require("./scripts/match");
    const output = await match(location);
    await setupDirectory("matched-data");
    await writeJSON(
      path.join(
        process.cwd(),
        "matched-data",
        `${sanitizePathSegment(location)}.json`,
      ),
      output,
    );
    return;
  }

  if (action.toLowerCase() === "diff") {
    // Unlike the other stages, diff works on two releases rather than one, so
    // it takes both tags instead of a location, plus the current release's
    // publish time — the diff is anchored to that rather than to the wall
    // clock so a retry reproduces the same result. See scripts/diff.
    const [currentTag, previousTag, currentPublishedAt] = [
      location,
      ...parameters,
    ];
    if (!currentTag || !previousTag) {
      throw new Error("No current and previous release tags provided");
    }
    if (!currentPublishedAt) {
      throw new Error(
        "No published_at provided for the current release; it anchors the diff so repeated runs agree",
      );
    }
    const asOf = Date.parse(currentPublishedAt);
    if (Number.isNaN(asOf)) {
      throw new Error(
        `Could not parse published_at for the current release: ${currentPublishedAt}`,
      );
    }

    const { compareReleases, buildPublishedDiff } = require("./scripts/diff");
    const comparison = await compareReleases({
      currentDir: path.join(process.cwd(), "transformed-data", "current"),
      previousDir: path.join(process.cwd(), "transformed-data", "previous"),
      currentTag,
      previousTag,
      asOf,
    });

    const output = buildPublishedDiff(comparison);
    if (!output) {
      console.log("➡️  No changes between releases; nothing to write");
      return;
    }

    await setupDirectory("diffed-data");
    await writeJSON(
      path.join(process.cwd(), "diffed-data", "diffed-data.json"),
      output,
    );
    console.log(
      `➡️  Diffed ${Object.keys(output.venues).length} changed venues of ${output.metadata.venueCount}`,
    );
    return;
  }

  if (action.toLowerCase() === "accessibility-validate") {
    // Venue accessibility is reviewed data committed to this repo rather than
    // a pipeline output: see docs/venue-accessibility.md. This checks every record
    // against the venue it describes and the source rules, and every quote
    // against the pages last fetched, if there are any.
    const { getAllCinemaNames, getCinemaAttributes } = require("./cinemas");
    const { readRecords } = require("./common/accessibility/records");
    const {
      validateAll,
      getPublicationBlockers,
      findMissingQuotes,
    } = require("./common/accessibility/validate");

    const records = await readRecords();
    const { errors } = validateAll(
      records,
      getAllCinemaNames().map(getCinemaAttributes),
    );

    const pagesDirectory = path.join(process.cwd(), "accessibility-pages");
    let pages = null;
    try {
      pages = await readJSON(path.join(pagesDirectory, "index.json"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (pages) {
      const textByUrl = new Map();
      for (const page of pages.pages) {
        const { text } = await readJSON(path.join(pagesDirectory, page.file));
        textByUrl.set(page.url, text);
      }
      records.forEach((record) =>
        findMissingQuotes(record, (url) => textByUrl.get(url)).forEach(
          (problem) => errors.push(`${record.id}: ${problem}`),
        ),
      );
    }

    const publishable = records.filter(
      (record) => getPublicationBlockers(record).length === 0,
    );
    console.log(
      `${records.length} records, ${publishable.length} publishable` +
        (pages ? "" : "; quotes not checked, no accessibility-pages/"),
    );
    if (errors.length) {
      throw new Error(
        `${errors.length} accessibility problems:\n${errors.join("\n")}`,
      );
    }
    return;
  }

  if (action.toLowerCase() === "accessibility-fetch") {
    // Fetch every access page in the source registry, store its text and say
    // which have changed since the hashes committed beside the records.
    const {
      readSources,
      DATA_DIRECTORY,
    } = require("./common/accessibility/records");
    const { fetchSources } = require("./scripts/accessibility");

    const hashesPath = path.join(DATA_DIRECTORY, "page-hashes.json");
    let previousHashes = {};
    try {
      previousHashes = await readJSON(hashesPath);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/London",
    });
    const { pages, hashes, changed, failures } = await fetchSources({
      sources: await readSources(),
      previousHashes,
      today,
    });

    await setupDirectory("accessibility-pages");
    for (const page of pages) {
      await writeJSON(
        path.join(process.cwd(), "accessibility-pages", page.file),
        {
          url: page.url,
          venueId: page.venueId,
          hash: page.hash,
          text: page.text,
        },
      );
    }
    await writeJSON(
      path.join(process.cwd(), "accessibility-pages", "index.json"),
      {
        fetched_on: today,
        pages: pages.map(({ venueId, url, file, hash }) => ({
          venueId,
          url,
          file,
          hash,
        })),
        changed,
        failures,
      },
    );
    await writeJSON(hashesPath, hashes);

    console.log(
      `${pages.length} pages fetched, ${changed.length} new or changed, ${failures.length} failed`,
    );
    changed.forEach(({ venueId, url, reason }) =>
      console.log(`  ${reason}: ${venueId} ${url}`),
    );
    // Written before failing, so the pages that did come back are kept.
    if (failures.length) {
      throw new Error(
        `${failures.length} pages failed:\n${failures
          .map(({ venueId, url, error }) => `${venueId} ${url}: ${error}`)
          .join("\n")}`,
      );
    }
    return;
  }

  if (action.toLowerCase() === "registry") {
    // The registry is a fold: this release's transformed data plus the last
    // published registry. It deliberately does not look at the previous
    // transformed release - see scripts/registry.
    const [release] = [location];
    if (!release) {
      throw new Error("No release tag provided for the registry");
    }

    const {
      buildRegistry,
      buildVenueRegistry,
      getPresent,
      readPreviousRegistry,
    } = require("./scripts/registry");

    const present = await getPresent(
      path.join(process.cwd(), "transformed-data", "current"),
    );
    const previousRegistry = await readPreviousRegistry(
      path.join(process.cwd(), "previous-registry", "seen-registry.json"),
    );
    const previousVenueRegistry = await readPreviousRegistry(
      path.join(process.cwd(), "previous-registry", "venue-registry.json"),
    );

    await setupDirectory("diffed-data");
    await writeJSON(
      path.join(process.cwd(), "diffed-data", "seen-registry.json"),
      buildRegistry({
        present: present.movies,
        previousRegistry,
        release,
      }),
    );
    // A separate artifact rather than another key: the two have different
    // retention rules, and nothing that reads one should have to parse the
    // other. Only the venue registry is safe for a backfill to fold straight
    // into; the movie registry takes older releases through mergeBackfill
    // (helpers/backfill-seen-registry.js).
    await writeJSON(
      path.join(process.cwd(), "diffed-data", "venue-registry.json"),
      buildVenueRegistry({
        present: present.venues,
        previousRegistry: previousVenueRegistry,
        release,
      }),
    );
    return;
  }

  if (action.toLowerCase() === "llm-usage-report") {
    // Takes a directory holding every venue's llm-usage-data file for one
    // transform run (downloaded from each venue's artifact) and aggregates
    // them into a single report - see scripts/llm-usage. A snapshot of one
    // run, not a fold across runs: the pipeline goes several times a day, so
    // even a day's usage is a sum over reports, and trends are a job for
    // whatever collects them - data-analysed - not this repo.
    const [inputDirectory] = [location];
    if (!inputDirectory) {
      throw new Error(
        "No input directory provided; pass the directory holding every venue's llm-usage-data file",
      );
    }

    const {
      loadUsageData,
      buildUsageReport,
      buildUsageSummary,
    } = require("./scripts/llm-usage");
    const usageByVenue = await loadUsageData(inputDirectory);
    const report = buildUsageReport(usageByVenue);
    const summary = buildUsageSummary(report);

    await setupDirectory("llm-usage-report");
    await writeJSON(
      path.join(process.cwd(), "llm-usage-report", "llm-usage-report.json"),
      report,
    );
    // Plain text rather than writeJSON: this is read by humans (printed here,
    // and available for a workflow to fold into a step summary), not parsed.
    await fs.writeFile(
      path.join(process.cwd(), "llm-usage-report", "summary.txt"),
      summary,
    );
    console.log(summary);
    return;
  }

  if (action.toLowerCase() === "departed") {
    const departed = require("./scripts/departed");
    const output = await departed();
    await setupDirectory("combined-data");
    // Written beside combined-data.json rather than into it: nothing that
    // reads the combined blob should see movies that are no longer showing.
    await writeJSON(
      path.join(process.cwd(), "combined-data", "departed-movies.json"),
      output,
    );
    return;
  }

  if (action.toLowerCase() === "cache") {
    const cacheMoviedb = require("./scripts/cache");
    const { movieInfo, collectionInfo } = await cacheMoviedb();
    await setupDirectory("cached-data");
    // Two files rather than one object: moviedb-data.json is read by both the
    // combine and match stages, so its shape has to stay as it is.
    await writeJSON(
      path.join(process.cwd(), "cached-data", "moviedb-data.json"),
      movieInfo,
    );
    await writeJSON(
      path.join(process.cwd(), "cached-data", "moviedb-collections.json"),
      collectionInfo,
    );
    return;
  }

  if (action.toLowerCase() === "transform-prepare") {
    // Once per run, before any venue's transform: builds the inputs every
    // venue shares so none of them has to - see scripts/transform/transform-inputs.
    const {
      prepareTransformInputs,
    } = require("./scripts/transform/transform-inputs");
    await prepareTransformInputs();
    return;
  }

  const getPath = (type) => path.join(process.cwd(), type, location);
  if (!location) throw new Error("No location provided");

  if (action.toLowerCase() === "health") {
    // `location` is a chain group, not a venue: one listing call answers the
    // whole estate, so the probe runs per group - see scripts/health.
    const health = require("./scripts/health");
    const rows = await health(location);
    await setupDirectory("health-data");
    await writeJSON(getPath("health-data"), rows);

    // Written before the job is allowed to fail. A challenged or missing venue
    // is exactly the evidence this stage exists to record, and throwing first
    // would discard it. The job still goes red, and nothing silently passes.
    const failures = rows.filter(({ reason }) =>
      health.FAILURE_KINDS.has(reason?.kind),
    );
    if (failures.length > 0) {
      throw new Error(
        `Health check failed for ${failures.length} of ${rows.length} venues: ${failures
          .map(({ venue, reason }) => `${venue} (${reason.kind})`)
          .join(", ")}`,
      );
    }
    return;
  }

  if (action.toLowerCase() === "retrieve") {
    const retrieve = require("./scripts/retrieve");
    const output = await retrieve(location, ...parameters);
    await setupDirectory("retrieved-data");
    await writeJSON(getPath("retrieved-data"), output);

    // Written first, because that is what the check reads - see
    // scripts/retrieve/check-retrieved-data. A failing check fails the step,
    // so the file is never uploaded.
    const {
      checkRetrievedData,
    } = require("./scripts/retrieve/check-retrieved-data");
    console.log("Checking the transform can read it ...");
    try {
      const start = Date.now();
      const { checked } = await checkRetrievedData(location);
      const duration = Math.round((Date.now() - start) / 1000);
      if (checked) console.log(` - ✅ Checked (${duration}s)`);
    } catch (e) {
      console.log(` - ❌ The transform can't read what was retrieved`);
      throw e;
    }
    return;
  }

  if (action.toLowerCase() === "transform") {
    await setupDirectory("transformed-data");
    // Built once per run by `transform-prepare` rather than per venue - see
    // scripts/transform/transform-inputs.
    const {
      readTransformInputs,
    } = require("./scripts/transform/transform-inputs");
    const transform = require("./scripts/transform");
    const input = await readJSON(getPath("retrieved-data"));
    const { previousRelease, historicalSeen, sourcedEvents, placedShowingIds } =
      await readTransformInputs(location);
    clearLlmUsageLog();
    const output = await transform(
      location,
      input,
      previousRelease,
      historicalSeen,
      sourcedEvents,
      placedShowingIds,
      ...parameters,
    );
    await writeJSON(
      getPath("transformed-data"),
      output.sort((a, b) => a.title.localeCompare(b.title)),
    );
    // A separate artifact rather than a field on the transformed output:
    // nothing that reads cinema listings should carry LLM diagnostics. See
    // scripts/llm-usage, which aggregates these across every venue's run.
    await setupDirectory("llm-usage-data");
    await writeJSON(getPath("llm-usage-data"), getLlmUsageLog());
    return;
  }

  throw new Error(`Unknown action provided, ${action}`);
})().catch((error) => {
  console.error(`\n❌ ${error.stack || error.message || error}`);
  process.exit(1);
});
