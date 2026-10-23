const {
  fetchText,
  fetchWithRetry,
  fetchError,
  assertSelector,
  sleep,
  withJitter,
} = require("../../common/utils");
const { domain } = require("./attributes");

// The site is a small WordPress install on LiteSpeed, whose host firewall on
// 23rd October 2026 started dropping the runner's connections outright - every
// request timing out, the site's own pages included - for hours at a time.
// Until then a retrieve fetched every event page back to back, ~48 requests in
// 16 seconds, which is the kind of burst that firewall acts on. So the event
// pages are spaced out, jittered so they don't land at robotically exact
// intervals.
const REQUEST_DELAY_MS = 5_000;
const pace = () => sleep(withJitter(REQUEST_DELAY_MS));

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
    await pace();
    eventPages[eventPageUrl] = await fetchText(eventPageUrl);
  }

  return { movieListPage, eventPages };
}

module.exports = retrieve;
