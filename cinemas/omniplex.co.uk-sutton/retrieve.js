const { format } = require("date-fns");
const { fetchWin1252Text } = require("../../common/utils");
const { domain, cinemaId } = require("./attributes");

function extractAllowedDates(html) {
  const m = html.match(/allowedDatesTimestamps\s*=\s*(\[[^\]]+\])/);
  if (!m)
    throw new Error("Could not find allowedDatesTimestamps on showtimes page");
  const timestamps = JSON.parse(m[1]);
  // Timestamps are midnight BST; format() uses TZ=Europe/London (set by pipeline)
  const toDateStr = (ts) => format(new Date(ts), "yyyy-MM-dd");
  return [...new Set(timestamps.map(toDateStr))].sort();
}

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
