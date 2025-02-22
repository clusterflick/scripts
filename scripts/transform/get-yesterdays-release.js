const {
  startOfYesterday,
  endOfYesterday,
  isWithinInterval,
  parseISO,
} = require("date-fns");
const { fetchJson } = require("../../common/utils");

async function getYesterdaysRelease(location) {
  const { Octokit } = await import("@octokit/core");

  const octokit = new Octokit();
  const response = await octokit.request(
    "GET /repos/clusterflick/data-transformed/releases",
  );

  const startYesterday = startOfYesterday();
  const endYesterday = endOfYesterday();
  let yesterdayRelease;
  response.data.forEach((release) => {
    const releaseDate = parseISO(release.published_at);
    const isYesterday = isWithinInterval(releaseDate, {
      start: startYesterday,
      end: endYesterday,
    });
    if (isYesterday) yesterdayRelease = release;
  });

  const yesterdayData = yesterdayRelease.assets.find(
    ({ name }) => name === location,
  );
  const assetData = await fetchJson(yesterdayData.browser_download_url);
  return assetData;
}

module.exports = getYesterdaysRelease;
