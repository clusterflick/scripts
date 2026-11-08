const cheerio = require("cheerio");
const {
  fetchText,
  fetchWithRetry,
  fetchError,
  assertSelector,
} = require("../../common/utils");
const { url } = require("./attributes");

// Guard that we loaded the venue page itself, not the listing section: this is
// a seasonal outdoor venue, and out of season the whole ".upcomingEvents"
// section is dropped. "body.single-venue" is present whether or not there are
// shows, so it still catches a redirect/error/redesign while tolerating a
// legitimate empty season.
const VENUE_PAGE_SELECTOR = "body.single-venue";

// From GitHub's runners the site sometimes answers with a "One moment,
// please... Please wait while your request is being verified..." interstitial
// under a 2xx, which `classifyRefusal` doesn't recognise, so no `🤖 Bot` line
// is logged. The site sits behind Cloudflare on Cloudways, and which layer
// serves the interstitial isn't known. Log the response's status and headers
// when it happens, so the vendor's own signal can be taught to the classifier
// rather than matching its copy on a 2xx.
const logResponseAtFailure = (response) => {
  const headers = [...response.headers.entries()]
    .map(([name, value]) => `  ${name}: ${value}`)
    .join("\n");
  console.log(
    `Response at failure: ${response.status} ${response.statusText} (${response.url})\n${headers}`,
  );
};

async function retrieve() {
  const response = await fetchWithRetry(url);
  if (!response.ok) throw fetchError(url, response);
  const movieListPage = await response.text();
  if (cheerio.load(movieListPage)(VENUE_PAGE_SELECTOR).length === 0) {
    logResponseAtFailure(response);
  }
  assertSelector(movieListPage, VENUE_PAGE_SELECTOR);

  const $ = cheerio.load(movieListPage);
  const eventUrls = new Set();
  $(".upcomingEvents a[href*='/event/']").each(function () {
    eventUrls.add($(this).attr("href"));
  });

  const moviePages = {};
  for (const eventUrl of [...eventUrls]) {
    moviePages[eventUrl] = await fetchText(eventUrl);
  }

  return { movieListPage, moviePages };
}

module.exports = retrieve;
