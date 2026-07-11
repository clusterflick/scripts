const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Regenerates the HTTP recordings and Jest snapshots for a single cinema venue.
//
// Flow:
//   1. Bail out if the venue uses hand-maintained manual recordings.
//   2. Delete the existing __recordings__ and __snapshots__.
//   3. Flip `isRecording` to true and set the fake system time to today.
//   4. Run the tests (recording live HTTP). They fail on the length checks.
//   5. Read the received lengths from the failures and update the assertions.
//   6. Re-run until green (still recording).
//   7. Confirm recordings and snapshots were written.
//   8. Flip `isRecording` back to false and verify the tests replay green.
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

  // 1. Refuse to touch venues backed by hand-maintained manual recordings.
  log.step("Checking for manual recordings");
  const manualDir = path.join(testDir, "__manual-recordings__");
  const usesCacheMock = fs
    .readFileSync(testFile, "utf8")
    .includes("setupCacheMock");
  if (fs.existsSync(manualDir) || usesCacheMock) {
    const reasons = [];
    if (fs.existsSync(manualDir))
      reasons.push("__manual-recordings__ directory");
    if (usesCacheMock) reasons.push("setupCacheMock usage");
    fail(
      `${venueId} relies on manual recordings (${reasons.join(", ")}).\n` +
        `  These are hand-maintained and must not be auto-regenerated. Skipping.`,
    );
  }
  log.ok("No manual recordings — safe to regenerate");

  // 2. Delete existing recordings and snapshots.
  log.step("Deleting existing recordings and snapshots");
  for (const name of ["__recordings__", "__snapshots__"]) {
    const dir = path.join(testDir, name);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      log.ok(`Removed ${path.relative(ROOT, dir)}`);
    } else {
      log.info(`No ${name} to remove`);
    }
  }

  // 3. Turn recording on and lock the clock to today.
  const today = todayIso();
  log.step(`Enabling recording and setting system time to ${today}`);
  setRecording(testFile, true);
  setSystemTime(testFile, today);
  log.ok("isRecording = true");
  log.ok(`setSystemTime = ${today}`);

  // 4. A single recording run captures ALL live HTTP: retrieve() does every
  //    network call and runs to completion before the first length assertion,
  //    so even though this run fails on those assertions the recordings are
  //    already complete. This is the only step that hits live servers.
  log.step("Recording live HTTP (only step that hits live servers)");
  let { passed, json } = runTests(testFile);
  log.ok("Live HTTP captured to __recordings__");

  // 5. Recording done — reconcile the length assertions entirely in replay.
  //    transform() makes no network calls, so replay has everything it needs.
  log.step("Disabling recording; reconciling length assertions in replay");
  setRecording(testFile, false);
  log.ok("isRecording = false");

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

  // If the tests passed straight from the recording run, the snapshot was
  // written in record mode and replay is still unproven — verify it once.
  if (replayRuns === 0) {
    log.info("Verifying replay…");
    if (!runTests(testFile).passed) {
      fail("Replay verification failed after disabling recording.");
    }
    log.ok("Replay verified");
  }

  // 6. Confirm the artefacts were actually written.
  log.step("Confirming recordings and snapshots were created");
  const recordingsDir = path.join(testDir, "__recordings__");
  const snapshotsDir = path.join(testDir, "__snapshots__");
  if (!dirHasFiles(recordingsDir)) {
    fail("__recordings__ was not created (or is empty).");
  }
  log.ok(`${path.relative(ROOT, recordingsDir)} created`);
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
