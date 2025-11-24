const { fetchSignedJson } = require("./utils");

const getDatesQueryBody = (cinema_location_id) => ({
  api: "dates",
  sales_channel_id: 1,
  cinema_location_id,
  page_number: "1",
  url_key: "",
  widget_id: "movie_calendar",
  calendar_date_picker_option: "1",
});

const getPerformancesQueryBodyFor = (cinema_location_id, session_date) => ({
  sales_channel_id: 1,
  cinema_location_id,
  widget_id: "movie_calendar",
  api: "list",
  session_date,
  has_limit: 0,
  per_page: 100,
  page_number: 1,
  url_key: "",
  theater_experiance: "",
  group_to_theater_experiance: false,
  sort_by: "showtime",
});

async function retrieve({ apiKey, apiDomain, locationId }) {
  const apiUrl = `${apiDomain}/api_v3/cms_widget/index`;
  const movieDatesPage = await fetchSignedJson(
    apiKey,
    apiUrl,
    getDatesQueryBody(locationId),
  );
  const movieListPage = [];
  for (const date of movieDatesPage.data.dates) {
    const performancesForDayPage = await fetchSignedJson(
      apiKey,
      apiUrl,
      getPerformancesQueryBodyFor(locationId, date.session_start_date),
    );
    movieListPage.push(performancesForDayPage);
  }

  return { movieDatesPage, movieListPage };
}

module.exports = retrieve;
