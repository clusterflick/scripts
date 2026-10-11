const {
  fetchText,
  fetchWithRetry,
  fetchError,
  assertSelector,
} = require("../../common/utils");
const { domain } = require("./attributes");

// The Ticketsolve feed is the authority on performances, but the venue writes
// films up on its WordPress site first and its Ticketsolve descriptions can lag
// by weeks, so the film details come from the website's event pages. The REST
// index lists every event but carries only the blurb - year, certificate,
// duration, director and cast exist only on the rendered page.
async function getEventPageUrls() {
  const urls = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const url = `${domain}/wp-json/wp/v2/event?per_page=100&_fields=link&page=${page}`;
    const response = await fetchWithRetry(url);
    if (!response.ok) throw fetchError(url, response);
    totalPages = Number(response.headers.get("x-wp-totalpages"));
    if (!totalPages) {
      throw new Error(`Missing X-WP-TotalPages header from ${url}`);
    }
    const events = await response.json();
    urls.push(...events.map(({ link }) => link));
    page += 1;
  }
  return urls;
}

async function retrieve() {
  const movieListPage = await fetchText(
    "https://davidleancinema.ticketsolve.com/shows.xml",
  );
  assertSelector(movieListPage, "venues > venue > shows > show");

  const eventPageUrls = await getEventPageUrls();
  if (eventPageUrls.length === 0) {
    throw new Error("No events found on the website");
  }

  const eventPages = {};
  for (const eventPageUrl of eventPageUrls) {
    eventPages[eventPageUrl] = await fetchText(eventPageUrl);
  }

  return { movieListPage, eventPages };
}

module.exports = retrieve;
