const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Regenerates the recordings and Jest snapshots for a single cinema venue.
//
// A venue is captured two ways, and the script does whichever it already uses:
//   - Polly __recordings__: live `fetch` HTTP, captured by a jest run with
//     `isRecording = true`.
//   - __manual-recordings__: data cached via dailyCache (e.g. Playwright pages),
//     captured by `npm run retrieve <venue>` and the setupCacheMock mock.
// Mixed venues (Curzon/Odeon) use both.
//
// Flow (presence-driven):
//   1. Detect which of the two the venue uses.
//   2. Delete __snapshots__ (and __recordings__ if used).
//   3. If it uses manual recordings: wipe ./cache, run the real retrieve, move
//      the fresh ./cache into __manual-recordings__, update the setupCacheMock
//      date. (Runs first so a mixed venue's record run reads the fresh cache.)
//   4. Set the fake system time to today.
//   5. If it uses Polly: record live HTTP in a single `isRecording = true` run,
//      then flip back to false.
//   6. Reconcile the length assertions offline in replay until green.
//   7. Confirm the artefacts it uses (and __snapshots__) were written.
//
// Usage: node helpers/regenerate-recordings.js <venue-id>
//   e.g. node helpers/regenerate-recordings.js cineworld.co.uk-bexleyheath

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const log = {
  step: (msg) =>
    console.log(`${colors.cyan}${colors.bold}▶ ${msg}${colors.reset}`),
  info: (msg) => console.log(`  ${colors.gray}${msg}${colors.reset}`),
  ok: (msg) => console.log(`  ${colors.green}✓ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`  ${colors.yellow}! ${msg}${colors.reset}`),
};

function fail(msg) {
  console.error(`\n${colors.red}${colors.bold}✗ ${msg}${colors.reset}\n`);
  process.exit(1);
}

const MAX_ITERATIONS = 8;
const ROOT = path.resolve(__dirname, "..");
// eslint-disable-next-line no-control-regex
const stripAnsi = (str) => str.replace(/\x1b\[[0-9;]*m/g, "");

const todayIso = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

// Resolve the venue's test directory. Most venues use `tests/`, a handful `test/`.
function resolveTestDir(venueId) {
  const venueDir = path.join(ROOT, "cinemas", venueId);
  if (!fs.existsSync(venueDir)) {
    fail(`No such venue: cinemas/${venueId}`);
  }
  for (const name of ["tests", "test"]) {
    const dir = path.join(venueDir, name);
    if (fs.existsSync(path.join(dir, "index.test.js"))) return dir;
  }
  fail(`No index.test.js found under cinemas/${venueId}/tests or /test`);
}

// Run the venue's tests. Returns { passed, json, raw }.
function runTests(testFile) {
  const result = spawnSync(
    "npx",
    ["jest", testFile, "--json", "--ci=false", "--runInBand"],
    {
      cwd: ROOT,
      env: { ...process.env, TZ: "Europe/London" },
      encoding: "utf8",
      maxBuffer: 100 * 1024 * 1024,
    },
  );

  const stdout = result.stdout || "";
  // Jest prints only JSON to stdout with --json; be defensive and slice it out.
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  let json = null;
  if (start !== -1 && end !== -1) {
    try {
      json = JSON.parse(stdout.slice(start, end + 1));
    } catch {
      json = null;
    }
  }
  if (!json) {
    console.error(result.stderr || stdout);
    fail("Could not parse Jest JSON output (see above).");
  }
  return { passed: json.success === true, json, raw: result };
}

// Pull { line, received } pairs out of the failing assertions for a test file.
// Each failing `toHaveLength` reports a "Received length: N" and a stack frame
// pointing at the assertion's line in the test file.
function parseLengthFailures(json, testFile) {
  const failures = [];
  const others = [];
  for (const suite of json.testResults) {
    for (const assertion of suite.assertionResults) {
      if (assertion.status !== "failed") continue;
      for (const rawMessage of assertion.failureMessages) {
        const message = stripAnsi(rawMessage);
        const receivedMatch = message.match(/Received length:\s*(\d+)/);
        const lineMatch = message.match(
          new RegExp(`${escapeRegExp(testFile)}:(\\d+):\\d+`),
        );
        if (receivedMatch && lineMatch) {
          failures.push({
            line: Number(lineMatch[1]),
            received: Number(receivedMatch[1]),
          });
        } else {
          others.push(message.split("\n").slice(0, 6).join("\n"));
        }
      }
    }
  }
  return { failures, others };
}

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Replace the number inside `toHaveLength(...)` on a specific 1-indexed line.
function updateLengthOnLine(testFile, line, received) {
  const lines = fs.readFileSync(testFile, "utf8").split("\n");
  const index = line - 1;
  const original = lines[index];
  if (!/toHaveLength\(\d+\)/.test(original)) {
    fail(
      `Expected a toHaveLength(...) on line ${line} but found:\n    ${original}`,
    );
  }
  lines[index] = original.replace(
    /toHaveLength\(\d+\)/,
    `toHaveLength(${received})`,
  );
  fs.writeFileSync(testFile, lines.join("\n"));
  return { from: original.trim(), to: lines[index].trim() };
}

function setRecording(testFile, value) {
  const content = fs.readFileSync(testFile, "utf8");
  if (!/const isRecording = (true|false);/.test(content)) {
    fail("Could not find `const isRecording = ...;` in the test file.");
  }
  fs.writeFileSync(
    testFile,
    content.replace(
      /const isRecording = (true|false);/,
      `const isRecording = ${value};`,
    ),
  );
}

function setSystemTime(testFile, isoDate) {
  const content = fs.readFileSync(testFile, "utf8");
  if (!/setSystemTime\(new Date\("[^"]*"\)\)/.test(content)) {
    fail('Could not find `setSystemTime(new Date("..."))` in the test file.');
  }
  fs.writeFileSync(
    testFile,
    content.replace(
      /setSystemTime\(new Date\("[^"]*"\)\)/,
      `setSystemTime(new Date("${isoDate}"))`,
    ),
  );
}

function setCacheMockDate(testFile, isoDate) {
  const content = fs.readFileSync(testFile, "utf8");
  if (!/setupCacheMock\(__dirname,\s*"[^"]*"\)/.test(content)) {
    fail('Could not find `setupCacheMock(__dirname, "...")` in the test file.');
  }
  fs.writeFileSync(
    testFile,
    content.replace(
      /setupCacheMock\(__dirname,\s*"[^"]*"\)/,
      `setupCacheMock(__dirname, "${isoDate}")`,
    ),
  );
}

// Run the venue's real retrieve (live) via the npm script, which sets the
// timezone. dailyCache writes the results to ./cache/<key>-<date>.
function runRetrieve(venueId) {
  const result = spawnSync("npm", ["run", "retrieve", venueId], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    fail(`\`npm run retrieve ${venueId}\` failed (see output above).`);
  }
}

// dailyCache names files `<key>-YYYY-MM-DD`. Every file from one retrieve shares
// the same trailing date; pull it out so setupCacheMock's suffix matches exactly.
function deriveCacheDateSuffix(cacheDir) {
  const suffixes = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
        continue;
      }
      const match = entry.name.match(/-(\d{4}-\d{2}-\d{2})$/);
      if (match) suffixes.add(match[1]);
    }
  };
  walk(cacheDir);
  if (suffixes.size === 0) {
    fail("Retrieve produced no dated cache files in ./cache.");
  }
  if (suffixes.size > 1) {
    fail(`./cache holds mixed dates (${[...suffixes].join(", ")}).`);
  }
  return [...suffixes][0];
}

function dirHasFiles(dir) {
  if (!fs.existsSync(dir)) return false;
  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).some((entry) => {
      if (entry.isDirectory()) return walk(path.join(d, entry.name));
      return true;
    });
  return walk(dir);
}

function main() {
  const venueId = process.argv[2];
  if (!venueId) {
    fail("Usage: node helpers/regenerate-recordings.js <venue-id>");
  }

  const testDir = resolveTestDir(venueId);
  const testFile = path.join(testDir, "index.test.js");
  const relTestFile = path.relative(ROOT, testFile);
  console.log(
    `\n${colors.bold}Regenerating recordings for ${colors.cyan}${venueId}${colors.reset}\n`,
  );

  // 1. Detect which capture mechanisms this venue uses.
  log.step("Detecting capture mechanisms");
  const recordingsDir = path.join(testDir, "__recordings__");
  const manualDir = path.join(testDir, "__manual-recordings__");
  const snapshotsDir = path.join(testDir, "__snapshots__");
  const testSource = fs.readFileSync(testFile, "utf8");
  const usesManual =
    testSource.includes("setupCacheMock") || fs.existsSync(manualDir);
  const usesPolly = fs.existsSync(recordingsDir) || !usesManual;
  if (usesManual && !testSource.includes("setupCacheMock")) {
    fail(
      "Found __manual-recordings__ but no setupCacheMock in the test — " +
        "can't regenerate the cache safely.",
    );
  }
  log.ok(`Polly recordings: ${usesPolly ? "yes" : "no"}`);
  log.ok(`Manual (cache) recordings: ${usesManual ? "yes" : "no"}`);

  // 2. Delete existing snapshots (and Polly recordings; the manual cache is
  //    replaced in step 3).
  log.step("Deleting existing snapshots and recordings");
  fs.rmSync(snapshotsDir, { recursive: true, force: true });
  log.ok(`Removed ${path.relative(ROOT, snapshotsDir)}`);
  if (usesPolly) {
    fs.rmSync(recordingsDir, { recursive: true, force: true });
    log.ok(`Removed ${path.relative(ROOT, recordingsDir)}`);
  }

  // 3. Regenerate the manual cache from a real retrieve. Done before the Polly
  //    record run so a mixed venue records live fetches against a fresh cache.
  let clockDate = todayIso();
  if (usesManual) {
    log.step("Regenerating manual cache (real retrieve — hits live servers)");
    const cacheDir = path.join(ROOT, "cache");
    fs.rmSync(cacheDir, { recursive: true, force: true });
    log.info(`npm run retrieve ${venueId}…`);
    runRetrieve(venueId);
    if (!dirHasFiles(cacheDir)) {
      fail("Retrieve produced no ./cache — nothing to move.");
    }
    clockDate = deriveCacheDateSuffix(cacheDir);
    fs.rmSync(manualDir, { recursive: true, force: true });
    fs.renameSync(cacheDir, manualDir);
    log.ok(`Moved ./cache → ${path.relative(ROOT, manualDir)}`);
    setCacheMockDate(testFile, clockDate);
    log.ok(`setupCacheMock date = ${clockDate}`);
  }

  // 4. Lock the fake clock to match the retrieved data.
  log.step(`Setting system time to ${clockDate}`);
  setSystemTime(testFile, clockDate);
  log.ok(`setSystemTime = ${clockDate}`);

  // 5. Capture live Polly HTTP (if used). A single recording run captures ALL
  //    of it: retrieve() does every fetch and completes before the first length
  //    assertion, so the recordings are complete even though the run fails on
  //    those assertions. This is the only Polly step that hits live servers.
  let passed;
  let json;
  if (usesPolly) {
    log.step("Recording live Polly HTTP (only Polly step that hits servers)");
    setRecording(testFile, true);
    ({ passed, json } = runTests(testFile));
    setRecording(testFile, false);
    log.ok("Live HTTP captured; isRecording = false");
  } else {
    log.step("Running tests (offline — replaying from manual cache)");
    ({ passed, json } = runTests(testFile));
  }

  // 6. Reconcile the length assertions entirely in replay (transform() makes no
  //    network calls, so replay has everything it needs).
  log.step("Reconciling length assertions in replay");
  let replayRuns = 0;
  while (!passed) {
    const { failures, others } = parseLengthFailures(json, testFile);
    if (failures.length === 0) {
      const detail = others.length
        ? `\n\n${others.join("\n\n")}`
        : "\n\n(no length mismatch found — a non-length assertion is failing)";
      fail(`Tests failed but no length assertion to update.${detail}`);
    }

    // Apply deepest line first so edits never shift a not-yet-applied line.
    for (const { line, received } of failures.sort((a, b) => b.line - a.line)) {
      const { from, to } = updateLengthOnLine(testFile, line, received);
      log.ok(`Line ${line}: ${from}  →  ${to}`);
    }

    if (++replayRuns > MAX_ITERATIONS) {
      fail(`Still failing after ${MAX_ITERATIONS} replay runs — giving up.`);
    }
    log.info(`Replay run ${replayRuns} (offline)…`);
    ({ passed, json } = runTests(testFile));
  }
  log.ok(
    replayRuns
      ? `Tests passed after ${replayRuns} replay run(s)`
      : "Tests passed with no length changes needed",
  );

  // If the counts were already right, the snapshot was written by the record
  // run (with isRecording still true). Verify a clean replay run once.
  if (replayRuns === 0 && usesPolly) {
    log.info("Verifying replay…");
    if (!runTests(testFile).passed) {
      fail("Replay verification failed after disabling recording.");
    }
    log.ok("Replay verified");
  }

  // 7. Confirm the artefacts this venue uses were actually written.
  log.step("Confirming artefacts were created");
  if (usesPolly) {
    if (!dirHasFiles(recordingsDir)) {
      fail("__recordings__ was not created (or is empty).");
    }
    log.ok(`${path.relative(ROOT, recordingsDir)} created`);
  }
  if (usesManual) {
    if (!dirHasFiles(manualDir)) {
      fail("__manual-recordings__ was not created (or is empty).");
    }
    log.ok(`${path.relative(ROOT, manualDir)} created`);
  }
  if (!dirHasFiles(snapshotsDir)) {
    fail("__snapshots__ was not created (or is empty).");
  }
  log.ok(`${path.relative(ROOT, snapshotsDir)} created`);

  console.log(
    `\n${colors.green}${colors.bold}✓ ${venueId} regenerated${colors.reset} ` +
      `${colors.gray}(${relTestFile})${colors.reset}\n`,
  );
}

main();
