const { startOfDay, format, endOfDay, addYears } = require("date-fns");
const { fetchJson, fetchText } = require("../../common/utils");

const formatDate = (date) => format(date, "yyyy-MM-dd'T'HH:mm:ss");

async function retrieve({ domain, url, cinemaId }) {
  const mainPage = await fetchText(url);

  // Extract the CMS hash URL from the main page
  const requestPrefix = mainPage.match(/src=\"([^"]+)webpack-runtime-/i)[1];
  const suffix = url.replace(domain, "");
  const pageData = await fetchJson(
    `${requestPrefix}page-data${suffix}page-data.json`,
  );

  let movieData = null;
  let attributeData = null;
  // Run through all page data blobs until we find the ones we want to keep
  for (hash of pageData.staticQueryHashes) {
    const data = await fetchJson(`${requestPrefix}page-data/sq/d/${hash}.json`);
    if (data?.data?.allMovie) movieData = data.data.allMovie.nodes;
    if (data?.data?.allAttribute) attributeData = data.data.allAttribute.nodes;
  }

  const websiteId = pageData.result.pageContext.websiteId;
  const movieIds = movieData.map(({ id }) => id);
  const today = new Date();
  const schedulePayload = {
    theaters: [{ id: cinemaId, timeZone: "Europe/London" }],
    movieIds,
    from: formatDate(startOfDay(today)),
    to: formatDate(endOfDay(addYears(today, 1))),
    nin: [],
    sin: [],
    websiteId,
  };

  const scheduleResponse = await fetch(
    "https://www.everymancinema.com/api/gatsby-source-boxofficeapi/schedule",
    {
      body: JSON.stringify(schedulePayload),
      method: "POST",
    },
  );
  const schedule = await scheduleResponse.json();

  return {
    movieListPage: schedule[cinemaId].schedule,
    moviePages: { movieData, attributeData },
  };
}

module.exports = retrieve;
