const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

// `scripts` is not versioned via package.json `version` — it is identified by
// its git SHA. Recover that SHA at runtime so every run can report exactly
// which build it is:
//
//   - Installed from GitHub (the CI/npx path): npm records the commit that was
//     installed in the package's own package.json as `gitHead`, and embeds it
//     in `_resolved` (e.g. `git+https://...#<40-char-sha>`).
//   - A local git checkout (development): those fields are absent, so fall back
//     to reading the current HEAD directly.
//
// Returns "unknown" if no SHA can be determined rather than throwing — this is
// purely informational and must never break a command.
function getVersion() {
  const pkgPath = path.join(__dirname, "..", "package.json");
  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    // Ignore — fall through to the git fallback below.
  }

  if (pkg.gitHead) return `${pkg.gitHead} (gitHead)`;

  const resolvedSha = /#([0-9a-f]{7,40})\b/.exec(pkg._resolved || "");
  if (resolvedSha) return `${resolvedSha[1]} (_resolved)`;

  try {
    const revParseHead = execSync("git rev-parse HEAD", {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return `${revParseHead} (git rev-parse HEAD)`;
  } catch {
    return "unknown";
  }
}

module.exports = { getVersion };
