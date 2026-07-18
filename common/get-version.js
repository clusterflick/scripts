const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

// `scripts` is not versioned via package.json `version` — it is identified by
// its git SHA. Recover that SHA at runtime so every run can report exactly
// which build it is.
//
// Returns "unknown" if no SHA can be determined rather than throwing — this is
// purely informational and must never break a command.

const packageRoot = path.join(__dirname, "..");

// Pull the commit out of a resolved git URL, e.g.
//   git+ssh://git@github.com/clusterflick/scripts.git#<40-char-sha>
const shaFromResolved = (resolved) =>
  /#([0-9a-f]{7,40})\b/.exec(resolved || "");

// Installed from GitHub (the CI / npx path): npm records the resolved commit in
// the hidden lockfile at the root of node_modules, keyed by install path. Note
// npm (v7+) strips `gitHead` / `_resolved` from the installed package.json
// itself, so the hidden lockfile is the reliable source at runtime.
function fromHiddenLockfile() {
  try {
    const lockfilePath = path.join(packageRoot, "..", ".package-lock.json");
    const lockfile = JSON.parse(fs.readFileSync(lockfilePath, "utf8"));
    const key = `node_modules/${path.basename(packageRoot)}`;
    const match = shaFromResolved(lockfile.packages?.[key]?.resolved);
    if (match) return `${match[1]} (.package-lock.json)`;
  } catch {
    // Not installed this way, or lockfile absent — fall through.
  }
  return null;
}

// Older npm / published packages may still carry these on the package.json.
function fromPackageJson() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
    );
    if (pkg.gitHead) return `${pkg.gitHead} (gitHead)`;
    const match = shaFromResolved(pkg._resolved);
    if (match) return `${match[1]} (_resolved)`;
  } catch {
    // Fall through.
  }
  return null;
}

// Local git checkout (development). Only trust this when scripts' own package
// root is a git repo — otherwise `git rev-parse` would walk up the tree and
// report the *consuming* repo's HEAD, which is not a scripts SHA.
function fromGitCheckout() {
  if (!fs.existsSync(path.join(packageRoot, ".git"))) return null;
  try {
    const sha = execSync("git rev-parse HEAD", {
      cwd: packageRoot,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return `${sha} (git rev-parse HEAD)`;
  } catch {
    return null;
  }
}

function getVersion() {
  return (
    fromHiddenLockfile() || fromPackageJson() || fromGitCheckout() || "unknown"
  );
}

module.exports = { getVersion };
