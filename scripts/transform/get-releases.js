const {
  startOfYesterday,
  endOfYesterday,
  isWithinInterval,
  parseISO,
} = require("date-fns");
const { fetchJson } = require("../../common/utils");

async function getReleaseData(location, release) {
  if (!release) return;

  const data = release.assets.find(({ name }) => name === location);
  if (!data) return;

  try {
    return await fetchJson(data.browser_download_url);
  } catch {
    // Wait 30 seconds before trying again
    await new Promise((resolve) => setTimeout(resolve, 30000));
    return await fetchJson(data.browser_download_url);
  }
}

async function getReleaseList() {
  const { Octokit } = await import("@octokit/core");

  const octokit = new Octokit({ auth: process.env.PAT });
  let response = await octokit.request(
    "GET /repos/clusterflick/data-transformed/releases",
  );

  if (!Array.isArray(response.data)) {
    console.warn("Unexpected response from GitHub releases API, retrying...");
    await new Promise((resolve) => setTimeout(resolve, 60000));
    response = await octokit.request(
      "GET /repos/clusterflick/data-transformed/releases",
    );
  }

  if (!Array.isArray(response.data)) {
    throw new Error(
      `GitHub releases API returned unexpected response: ${JSON.stringify(response)}`,
    );
  }

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
