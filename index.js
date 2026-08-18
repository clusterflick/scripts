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
    // other. Only the venue registry is safe for a backfill to rewrite.
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
    // day's run (downloaded from each venue's artifact) and aggregates them
    // into a single report - see scripts/llm-usage. A snapshot of one day,
    // not a fold across days: trends over time are a job for whatever
    // downloads and compares multiple days' reports, not this repo.
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

  const getPath = (type) => path.join(process.cwd(), type, location);
  if (!location) throw new Error("No location provided");

  if (action.toLowerCase() === "retrieve") {
    const retrieve = require("./scripts/retrieve");
    const output = await retrieve(location, ...parameters);
    await setupDirectory("retrieved-data");
    await writeJSON(getPath("retrieved-data"), output);
    return;
  }

  if (action.toLowerCase() === "transform") {
    await setupDirectory("transformed-data");
    const {
      getReleaseList,
      getYesterdaysRelease,
    } = require("./scripts/transform/get-releases");
    const {
      getHistoricalData,
    } = require("./scripts/transform/get-historical-seen");
    const transform = require("./scripts/transform");
    const input = await readJSON(getPath("retrieved-data"));
    const releaseList = await getReleaseList();
    const yesterdaysRelease = await getYesterdaysRelease(location, releaseList);
    const seenMap = await getHistoricalData();
    clearLlmUsageLog();
    const output = await transform(
      location,
      input,
      yesterdaysRelease,
      seenMap,
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
