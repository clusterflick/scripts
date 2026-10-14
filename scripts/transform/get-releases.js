const path = require("node:path");
const {
  startOfYesterday,
  endOfYesterday,
  isBefore,
  isWithinInterval,
  parseISO,
} = require("date-fns");
const { fetchJson, withRetry, writeJSON } = require("../../common/utils");

// Enough to keep a few downloads in flight without a run of 400-odd small
// assets queueing behind one another, and few enough that the CDN has no
// reason to start shedding us.
const DOWNLOAD_CONCURRENCY = 10;

// Every release embeds its full asset list - one entry per venue, so 470-odd
// apiece - and the endpoint's default page of 30 releases comes to ~23MB, which
// GitHub takes around 9s to build on a good day. That sits just under the
// point where it gives up with "We couldn't respond to your request in time"
// (or an empty 200), so the default page could fail whenever GitHub was a
// little slow. A page of 5 is ~4MB and comes back in a second or two, leaving
// plenty of headroom.
const RELEASES_PER_PAGE = 5;

// 30s, 60s, 120s, 240s, 480s across six attempts - about 15 minutes of
// waiting. Every venue's transform waits on this one call, so a GitHub blip
// that clears in a few minutes is worth sitting out rather than failing the
// run over; doubling the gap lets six attempts span a longer dip than a fixed
// cadence would.
//
// Every error is retried. GitHub's "couldn't respond in time" has no documented
// status, and a timeout misread as permanent would fail the run on its first
// attempt - so a bad PAT taking fifteen minutes to fail is the cheaper mistake.
const RETRY_CONFIG = { retries: 5, delayMs: 30_000, backoffFactor: 2 };

async function getReleasePage(octokit, page) {
  const response = await withRetry(
    async () => {
      const res = await octokit.request(
        "GET /repos/clusterflick/data-transformed/releases",
        { per_page: RELEASES_PER_PAGE, page },
      );
      if (!Array.isArray(res.data)) {
        throw new Error(
          `Unexpected response (status: ${res.status}, type: ${typeof res.data}): ${JSON.stringify(res.data).slice(0, 500)}`,
        );
      }
      return res;
    },
    {
      ...RETRY_CONFIG,
      label: `GitHub releases API (page ${page})`,
    },
  );

  return response.data;
}

// The list comes back newest first, so this is the last release published
// yesterday - or undefined if nothing was published yesterday. Pages are read
// only until they reach releases from before yesterday: today's runs may have
// published a few already, but anything older can't be yesterday's.
async function getYesterdaysRelease() {
  const { Octokit } = await import("@octokit/core");
  const octokit = new Octokit({ auth: process.env.PAT });
  const interval = { start: startOfYesterday(), end: endOfYesterday() };

  for (let page = 1; ; page++) {
    const releases = await getReleasePage(octokit, page);
    for (const release of releases) {
      const releaseDate = parseISO(release.published_at);
      if (isWithinInterval(releaseDate, interval)) return release;
      if (isBefore(releaseDate, interval.start)) return undefined;
    }
    if (releases.length < RELEASES_PER_PAGE) return undefined;
  }
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
  getYesterdaysRelease,
  downloadReleaseAssets,
};
