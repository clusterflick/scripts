const { startOfDay, format, endOfDay, addYears } = require("date-fns");
const { fetchJson, fetchText } = require("../../common/utils");
const { dailyCache } = require("../cache");

const formatDate = (date) => format(date, "yyyy-MM-dd'T'HH:mm:ss");

async function retrieve({ domain, cinemaId }) {
  const mainPage = await dailyCache(`everyman-main-page`, async () =>
    fetchText(`${domain}/venues-list`),
  );

  // Extract the CMS hash URL from the main page
  const requestPrefix = mainPage.match(/src="([^"]+)webpack-runtime-/i)[1];
  const pageData = await dailyCache(`everyman-page-data`, async () =>
    fetchJson(`${requestPrefix}page-data/venues-list/page-data.json`),
  );

  if (
    !Array.isArray(pageData.staticQueryHashes) ||
    pageData.staticQueryHashes.length === 0
  ) {
    console.log("Unexpected page data format:");
    console.log(JSON.stringify(pageData, null, 2));
    throw new Error("Unable to retrieve page data blob list");
  }

  let movieData = null;
  let attributeData = null;
  // Run through all page data blobs until we find the ones we want to keep
  for (const hash of pageData.staticQueryHashes) {
    const data = await dailyCache(`everyman-${hash}`, async () =>
      fetchJson(`${requestPrefix}page-data/sq/d/${hash}.json`),
    );
    if (data?.data?.allMovie) movieData = data.data.allMovie.nodes;
    if (data?.data?.allAttribute) attributeData = data.data.allAttribute.nodes;
  }

  if (!movieData || !attributeData) {
    console.log("Missing movie or attribute data:");
    console.log(JSON.stringify(movieData, null, 2));
    console.log(JSON.stringify(attributeData, null, 2));
    throw new Error("Unable to retrieve all move or all attribute data");
  }

  const movieIds = movieData.map(({ id }) => id);

  const moviesParams = new URLSearchParams();
  moviesParams.append("basic", "false");
  moviesParams.append("castingLimit", "10");
  movieIds.forEach((movieId) => moviesParams.append("ids", movieId));
  const movieDetails = await fetchJson(
    `${domain}/api/gatsby-source-boxofficeapi/movies?${moviesParams}`,
  );

  const today = new Date();
  const scheduleParams = new URLSearchParams({
    theaters: JSON.stringify({ id: cinemaId, timeZone: "Europe/London" }),
    from: formatDate(startOfDay(today)),
    to: formatDate(endOfDay(addYears(today, 1))),
  });
  const schedule = await fetchJson(
    `${domain}/api/gatsby-source-boxofficeapi/schedule?${scheduleParams}`,
  );

  return {
    movieListPage: schedule[cinemaId].schedule,
    moviePages: { movieData, movieDetails, attributeData },
  };
}

module.exports = retrieve;
