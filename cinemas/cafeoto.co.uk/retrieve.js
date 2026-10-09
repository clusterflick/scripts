const cheerio = require("cheerio");
const { fetchText, getText } = require("../../common/utils");
const { url, domain } = require("./attributes");
const { isFilmEvent } = require("./utils");

// Safety cap on pagination - the listing runs to about five pages, so this
// should never be reached; throw if it is, rather than looping forever.
const MAX_PAGES = 25;

// A single night is dated "Sunday 11 October 2026, 7.30pm"; a multi-night run
// is dated "29–31 October 2026" with no weekday, and its nights are only
// linked from its own page.
const isDateRange = (dateText) => /^\d/.test(dateText);

const getEventUrl = (href) => (href.startsWith("http") ? href : domain + href);

// A run's page links each of its nights, at the run's own slug with a numeric
// suffix - "/events/fred-frith-2026/" links "/events/fred-frith-2026-1/" - and
// carries its own date and title in the link text. Matching on the slug keeps
// out the unrelated events the page suggests alongside them.
const getNights = (runUrl, runPage) => {
  const slug = new URL(runUrl).pathname.replace(/\/$/, "");
  const nightPattern = new RegExp(`^${slug}-\\d+/?$`);
  const $ = cheerio.load(runPage);
  const nights = {};
  $("a[href]").each(function () {
    const href = $(this).attr("href");
    if (!nightPattern.test(href)) return;
    const nightUrl = getEventUrl(href);
    nights[nightUrl] = `${nights[nightUrl] || ""} ${getText($(this))}`.trim();
  });
  return nights;
};

async function retrieve() {
  // Café OTO is a music venue with no film category, so every event is listed
  // together. Keep the ones billed as films; the rest never leave retrieve.
  const movieListPages = [];
  const singleEvents = {};
  const runUrls = new Set();
  let pageUrl = url;
  let pageCount = 0;
  while (pageUrl) {
    pageCount += 1;
    if (pageCount > MAX_PAGES) {
      throw new Error(
        "Exceeded maximum page limit — stopping condition may have changed",
      );
    }

    const listPage = await fetchText(pageUrl);
    const $ = cheerio.load(listPage);
    const events = $(".each-activity");

    // An empty listing is not a venue with nothing on - it is the site serving
    // us something other than its listing.
    if (events.length === 0) {
      throw new Error(`No events found on ${pageUrl}`);
    }

    movieListPages.push(listPage);
    events.each(function () {
      const $headers = $(this).find(".each-header");
      const dateText = getText($headers.first());
      const $title = $headers.last();
      const href = $title.find("a[href]").attr("href");
      if (!href) {
        throw new Error(`No event link for "${getText($title)}" on ${pageUrl}`);
      }
      const eventUrl = getEventUrl(href);
      if (isDateRange(dateText)) {
        runUrls.add(eventUrl);
      } else {
        singleEvents[eventUrl] = getText($title);
      }
    });

    // The listing's infinite scroll loads the next page from this link, and the
    // last page has none - asking for a page past the end gets a 404.
    const nextHref = $("#iscroll_other a[href]").attr("href");
    pageUrl = nextHref ? new URL(nextHref, pageUrl).href : null;
  }

  const moviePageUrls = new Set(
    Object.keys(singleEvents).filter((eventUrl) =>
      isFilmEvent(singleEvents[eventUrl]),
    ),
  );

  // A run's nights aren't on the listing, so every run is opened to see them.
  // A film run takes all its nights; otherwise a night counts on its own title.
  for (const runUrl of runUrls) {
    const runPage = await fetchText(runUrl);
    const runTitle = getText(cheerio.load(runPage)(".event-detail-title h1"));
    const nights = getNights(runUrl, runPage);
    const isFilmRun = isFilmEvent(runTitle);
    if (isFilmRun && Object.keys(nights).length === 0) {
      throw new Error(`No nights found for film run ${runUrl}`);
    }
    for (const [nightUrl, nightText] of Object.entries(nights)) {
      if (isFilmRun || isFilmEvent(nightText)) moviePageUrls.add(nightUrl);
    }
  }

  const moviePages = {};
  for (const moviePageUrl of moviePageUrls) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return { movieListPages, moviePages };
}

module.exports = retrieve;
