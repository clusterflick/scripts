const { format, addYears } = require("date-fns");
const { fetchJson } = require("../../common/utils");

const tenantId = "10108";

async function retrieve({ cinemaId }) {
  const apiUrl = "https://www.cineworld.co.uk/uk/data-api-service/v1";
  const untilDate = format(addYears(new Date(), 1), "yyyy-MM-dd");
  const activeDates = await fetchJson(
    `${apiUrl}/quickbook/${tenantId}/dates/in-cinema/${cinemaId}/until/${untilDate}?attr=&lang=en_GB`,
  );

  const movieListPage = [];
  for (const activeDate of activeDates.body.dates) {
    const showingsOnDate = await fetchJson(
      `${apiUrl}/quickbook/${tenantId}/film-events/in-cinema/${cinemaId}/at-date/${activeDate}?attr=&lang=en_GB`,
    );
    movieListPage.push(showingsOnDate.body);
  }

  const filmIds = [
    ...new Set(movieListPage.flatMap(({ films }) => films.map(({ id }) => id))),
  ];

  const moviePages = {};
  for (const filmId of filmIds) {
    const url = `${apiUrl}/${tenantId}/films/byDistributorCode/${filmId}`;
    const additionalFilmData = await fetchJson(url);
    moviePages[filmId] = additionalFilmData.body;
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
