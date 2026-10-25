const cheerio = require("cheerio");
const {
  basicNormalize,
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

// The shows feed says "sold out" for a performance that hasn't gone on sale
// yet as well as for one that has sold every seat - the venue holds a whole
// month's programme back until a set on-sale date, and on 25th October 2026
// all twelve December performances read "sold out" with every seat free. Only
// the event's own feed tells them apart, with its seat count, so it is fetched
// for each performance the shows feed calls sold out. It's served by
// Ticketsolve, not the venue's firewalled host, so it isn't paced.
async function getSoldOutEventFeeds(movieListPage) {
  const $ = cheerio.load(movieListPage, { xmlMode: true });
  const eventFeeds = {};
  for (const el of $("venues > venue > shows > show > events > event")) {
    const $event = $(el);
    if (basicNormalize($event.children("status").text()) !== "sold out") {
      continue;
    }
    const feedUrl = $event.find("feed > url").text().trim();
    if (!feedUrl) {
      throw new Error(`No feed URL for sold out event ${$event.attr("id")}`);
    }
    eventFeeds[$event.attr("id")] = await fetchText(feedUrl);
  }
  return eventFeeds;
}

async function retrieve() {
  const movieListPage = await fetchText(
    "https://davidleancinema.ticketsolve.com/shows.xml",
  );
  assertSelector(movieListPage, "venues > venue > shows > show");
  const eventFeeds = await getSoldOutEventFeeds(movieListPage);

  const eventPageUrls = await getEventPageUrls();
  if (eventPageUrls.length === 0) {
    throw new Error("No events found on the website");
  }

  const eventPages = {};
  for (const eventPageUrl of eventPageUrls) {
    await pace();
    eventPages[eventPageUrl] = await fetchText(eventPageUrl);
  }

  return { movieListPage, eventFeeds, eventPages };
}

module.exports = retrieve;
