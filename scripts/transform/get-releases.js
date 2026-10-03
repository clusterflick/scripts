const path = require("node:path");
const {
  startOfYesterday,
  endOfYesterday,
  isWithinInterval,
  parseISO,
} = require("date-fns");
const { fetchJson, withRetry, writeJSON } = require("../../common/utils");

// Enough to keep a few downloads in flight without a run of 400-odd small
// assets queueing behind one another, and few enough that the CDN has no
// reason to start shedding us.
const DOWNLOAD_CONCURRENCY = 10;

async function getReleaseList() {
  const { Octokit } = await import("@octokit/core");
  const octokit = new Octokit({ auth: process.env.PAT });

  const response = await withRetry(
    async () => {
      const res = await octokit.request(
        "GET /repos/clusterflick/data-transformed/releases",
      );
      if (!Array.isArray(res.data)) {
        throw new Error(
          `Unexpected response (status: ${res.status}, type: ${typeof res.data}): ${JSON.stringify(res.data).slice(0, 500)}`,
        );
      }
      return res;
    },
    { retries: 2, delayMs: 60_000, label: "GitHub releases API" },
  );

  return response.data;
}

// The list comes back newest first, so this is the last release published
// yesterday - or undefined if nothing was published yesterday.
function getYesterdaysRelease(releaseList) {
  const startYesterday = startOfYesterday();
  const endYesterday = endOfYesterday();
  return releaseList.find((release) => {
    const releaseDate = parseISO(release.published_at);
    return isWithinInterval(releaseDate, {
      start: startYesterday,
      end: endYesterday,
    });
  });
}

// Each asset is one venue's transformed output, named after the venue id, so
// it lands at `<directory>/<venue id>` - the path a transform reads it from.
async function downloadReleaseAssets(release, directory) {
  const queue = [...release.assets];
  const worker = async () => {
    while (queue.length > 0) {
      const { name, browser_download_url } = queue.shift();
      const data = await withRetry(() => fetchJson(browser_download_url), {
        retries: 5,
        delayMs: 30_000,
        label: `Download ${name}`,
      });
      await writeJSON(path.join(directory, name), data);
    }
  };
  await Promise.all(
    Array.from({ length: DOWNLOAD_CONCURRENCY }, () => worker()),
  );
  return release.assets.length;
}

module.exports = {
  getReleaseList,
  getYesterdaysRelease,
  downloadReleaseAssets,
};
