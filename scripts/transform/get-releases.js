const {
  startOfYesterday,
  endOfYesterday,
  isWithinInterval,
  parseISO,
} = require("date-fns");
const { fetchJson, withRetry } = require("../../common/utils");

async function getReleaseData(location, release) {
  if (!release) return;

  const data = release.assets.find(({ name }) => name === location);
  if (!data) return;

  return await fetchJson(data.browser_download_url);
}

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
          `Unexpected response: ${JSON.stringify(res.data).slice(0, 200)}`,
        );
      }
      return res;
    },
    { retries: 1, delayMs: 60_000, label: "GitHub releases API" },
  );

  return response.data;
}

async function getYesterdaysRelease(location, releaseList) {
  const startYesterday = startOfYesterday();
  const endYesterday = endOfYesterday();
  const yesterdayRelease = releaseList.find((release) => {
    const releaseDate = parseISO(release.published_at);
    return isWithinInterval(releaseDate, {
      start: startYesterday,
      end: endYesterday,
    });
  });
  return await getReleaseData(location, yesterdayRelease);
}

async function getLatestRelease(location, releaseList) {
  const latestRelease = releaseList[0];
  return await getReleaseData(location, latestRelease);
}

module.exports = {
  getReleaseList,
  getYesterdaysRelease,
  getLatestRelease,
};
