const { fetchError } = require("../utils");

// How the calls are made. Direct by default; a chain whose API only answers a
// browser passes one that makes them from inside a page instead, so both paths
// run this one sequence.
//
// A 403 is thrown with its status so a caller can tell a refusal apart and
// escalate. Anything else is read as before: an error body is still JSON here,
// and the 404 check below depends on reading it.
const directTransport = {
  json: async (url, init) => {
    const response = await fetch(url, init);
    if (response.status === 403) throw fetchError(url, response);
    return response.json();
  },
};

async function retrieve(
  { cinemaId },
  { url, apiUrl, authToken },
  transport = directTransport,
) {
  const getHeaders = () => ({
    Accept: "application/json",
    authorization: `Bearer ${authToken}`,
  });

  const prefix = url || apiUrl;
  const { filmScreeningDates } = await transport.json(
    `${prefix}/ocapi/v1/film-screening-dates?siteIds=${cinemaId}`,
    { headers: getHeaders() },
  );

  const moviePages = [];

  for (const { businessDate } of filmScreeningDates) {
    const showtimesData = await transport.json(
      `${prefix}/ocapi/v1/showtimes/by-business-date/${businessDate}?siteIds=${cinemaId}`,
      { headers: getHeaders() },
    );
    if (showtimesData.status === 404) {
      throw new Error(
        `Something went wrong retrieving data for showing on "${businessDate}" at cinema "${cinemaId}"`,
      );
    }
    moviePages.push(showtimesData);
  }

  return moviePages;
}

module.exports = retrieve;
