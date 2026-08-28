const { fetchWin1252Text } = require("../../common/utils");
const { extractAllowedDates } = require("../../common/omniplex.co.uk/utils");
const { domain, cinemaId } = require("./attributes");

async function retrieve() {
  const indexPage = await fetchWin1252Text(
    `${domain}/cinema/showtimes/${cinemaId}`,
  );
  const dates = extractAllowedDates(indexPage);

  const datePages = {};
  for (const date of dates) {
    const url = `${domain}/cinema/showtimes/${cinemaId}?action=processFilters&filterDate=${date}`;
    datePages[date] = await fetchWin1252Text(url);
  }

  return { indexPage, datePages };
}

module.exports = retrieve;
