const {
  fetchSignedJson,
  apiUrlFor,
  getDatesQueryBody,
  getNowShowingQueryBody,
  getDatesFrom,
} = require("./utils");

// The calendar endpoint answers with at most one page of dates and misreports
// that it has done so: `total_pages` always comes back as 1, asking for page 2
// returns nothing, and neither raising `per_page` nor passing `has_limit: 0`
// lifts the cap. A venue selling further ahead than the cap - Lumiere Romford
// runs opera and ballet seasons a year out - silently loses every date past it,
// along with any film screening only on those dates.
//
// A single film's date list is served by the same endpoint but isn't capped in
// practice, so when the calendar comes back full we ask each film on sale for
// its own dates and screen those days too.

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
  const apiUrl = apiUrlFor(apiDomain);
  const movieDatesPage = await fetchSignedJson(
    apiKey,
    apiUrl,
    getDatesQueryBody(locationId),
  );

  // The cap is whatever the response says it is, so a change at the other end
  // is picked up rather than assumed away.
  const datesPerPage = movieDatesPage.data?.per_page;
  if (!datesPerPage) {
    throw new Error(
      "Calendar dates response is missing per_page - unable to tell whether the list of dates was capped",
    );
  }

  const dates = new Set(getDatesFrom(movieDatesPage));

  if (dates.size >= datesPerPage) {
    const nowShowingPage = await fetchSignedJson(
      apiKey,
      apiUrl,
      getNowShowingQueryBody(locationId),
    );
    const nowShowing = nowShowingPage.data?.movies;
    if (!nowShowing) {
      throw new Error(
        "No films on sale returned - unable to recover the dates the calendar capped off",
      );
    }

    for (const { url_key: urlKey, movie_name: movieName } of nowShowing) {
      const filmDatesPage = await fetchSignedJson(
        apiKey,
        apiUrl,
        getDatesQueryBody(locationId, urlKey),
      );
      const filmDates = getDatesFrom(filmDatesPage);
      if (filmDates.length >= datesPerPage) {
        throw new Error(
          `Dates for "${movieName}" hit the ${datesPerPage} date cap - its later screenings can't be recovered this way`,
        );
      }
      filmDates.forEach((date) => dates.add(date));
    }
  }

  const movieListPage = [];
  for (const date of [...dates].sort()) {
    const performancesForDayPage = await fetchSignedJson(
      apiKey,
      apiUrl,
      getPerformancesQueryBodyFor(locationId, date),
    );

    // A day's listings are capped the same way, and a day busy enough to fill a
    // page would lose the rest without saying so.
    if (performancesForDayPage.data?.total_pages > 1) {
      throw new Error(
        `Listings for ${date} span ${performancesForDayPage.data.total_pages} pages - only the first is read`,
      );
    }

    movieListPage.push(performancesForDayPage);
  }

  return { movieDatesPage, movieListPage };
}

module.exports = retrieve;
