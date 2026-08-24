const cheerio = require("cheerio");
const { format, addYears, parse, isValid } = require("date-fns");
const { withPlaywrightSession } = require("../get-page-with-playwright");
const { sleep, withJitter } = require("../utils");
const {
  probeError,
  classifyPage,
  startObservation,
} = require("../health-probe");

// One page load a venue - two for the estate - against a retrieve that opens
// every show's own page and is paced at 8-12s a request to stay under BFI's
// throttle, so runs for the better part of an hour.
//
// The calendar search is a list of performances, not shows: the same article
// appears once per showing, each carrying its own `.start-date`. The retrieve
// dedupes those down to shows because it wants the article pages; the probe
// wants exactly what the retrieve throws away.
const GRANULARITY = "performance";

// The default page size is 50 for IMAX (three pages of results), so ask for one
// large page instead. `total_pages` below is what proves it was enough - the
// search silently gives you the first page, and Southbank is already at 432.
const PAGE_SIZE = 500;

// Two page loads in quick succession drew a Cloudflare challenge, so space them
// the way the Southbank retrieve spaces its show pages. Jittered, because a
// fixed interval is its own signature.
const VENUE_DELAY_MS = 6000;

// A hire space rather than a cinema - it has no listings of its own and no
// calendar article, so there is nothing here to ask about. Named explicitly so a
// venue that is missing an `articleId` by mistake still fails loudly below.
const NOT_ON_THIS_API = ["bfi.org.uk-stephen-street"];

const dateFormat = "yyyy-MM-dd";

const searchUrl = ({ url, articleId }) => {
  const today = new Date();
  const query = [
    `doWork%3A%3AWScontent%3A%3Asearch=1`,
    `BOparam%3A%3AWScontent%3A%3Asearch%3A%3Aarticle_search_id=${articleId}`,
    `BOset%3A%3AWScontent%3A%3ASearchCriteria%3A%3Asearch_from=${format(today, dateFormat)}`,
    `BOset%3A%3AWScontent%3A%3ASearchCriteria%3A%3Asearch_to=${format(addYears(today, 1), dateFormat)}`,
    `BOset%3A%3AWScontent%3A%3ASearchResultsInfo%3A%3Apage_size=${PAGE_SIZE}`,
  ].join("&");
  return `${url}?${query}`;
};

// The results page carries its own tally in an inline `getPageObject()` script.
// It is the only way to know the page wasn't truncated - the markup looks
// identical whether you got all the results or the first 500 of them.
const getSearchInfo = (html) => {
  const match = html.match(
    /total_records:\s*(\d+),\s*total_pages:\s*(\d+),\s*page_size:\s*(\d+)/,
  );
  if (!match) throw probeError("No search totals in the results page");
  const [totalRecords, totalPages] = [Number(match[1]), Number(match[2])];
  if (totalPages > 1) {
    throw probeError(
      `Results ran to ${totalPages} pages of ${PAGE_SIZE}; raise PAGE_SIZE - only the first was read`,
    );
  }
  return { totalRecords };
};

// "Monday 24 August 2026 10:00" - a display string, so anything that fails to
// parse is a shape change rather than a missing showing, and is worth failing on
// instead of quietly counting fewer performances.
const parseStartDate = (text) => {
  const parsed = parse(text.trim(), "EEEE d MMMM yyyy HH:mm", new Date());
  return isValid(parsed) ? format(parsed, dateFormat) : null;
};

const tally = (html) => {
  const { totalRecords } = getSearchInfo(html);
  const $ = cheerio.load(html);
  const boxes = $(".result-box-item");

  if (boxes.length !== totalRecords) {
    throw probeError(
      `Read ${boxes.length} results but the page reports ${totalRecords}`,
    );
  }

  const films = new Set();
  const byDate = {};
  const unparsed = [];

  boxes.each(function () {
    const date = parseStartDate($(this).find(".start-date").text());
    if (!date) {
      unparsed.push($(this).find(".item-name").text().trim());
      return;
    }
    byDate[date] = (byDate[date] ?? 0) + 1;
    const href = $(this).find("a.more-info").attr("href") ?? "";
    const articleId = (href.match(/article_id=([0-9A-F-]+)/i) || [])[1];
    // A result without a link is a listing BFI hasn't made bookable yet; it
    // still counts as a performance, it just can't be attributed to a film.
    if (articleId) films.add(articleId.toUpperCase());
  });

  if (unparsed.length > 0) {
    throw probeError(
      `${unparsed.length} of ${boxes.length} results had an unreadable start date (e.g. "${unparsed[0]}")`,
    );
  }

  return { films, byDate };
};

async function health(allVenues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);

  const venues = allVenues.filter(({ id }) => !NOT_ON_THIS_API.includes(id));
  const untracked = venues.filter(({ articleId }) => !articleId);
  if (untracked.length > 0) {
    throw new Error(
      `No articleId on ${untracked.map(({ id }) => id).join(", ")}; the calendar search is keyed on it`,
    );
  }

  const results = await withPlaywrightSession(async (getPage) => {
    const rows = [];
    for (const [index, venue] of venues.entries()) {
      if (index > 0) await sleep(withJitter(VENUE_DELAY_MS));

      try {
        const html = await getPage(
          venue.url,
          // Its own key, so the probe never shares - or poisons - the
          // retrieve's calendar cache entry for the same venue.
          `health--${venue.id}`,
          async (page, response) => {
            await page.waitForLoadState("domcontentloaded");
            await page.goto(searchUrl(venue));
            try {
              await page.waitForLoadState("networkidle");
            } catch {
              // Timed out waiting for the network to settle; the wait below
              // decides whether the results actually arrived.
            }
            const results = page.locator(".detailed-search-results");
            await results.waitFor({ state: "attached" }).catch(() => {});
            if ((await results.count()) === 0) {
              // Covers both the challenge page and BFI's own 500, which the
              // search returns often enough that the retrieve races for it.
              return classifyPage(
                page,
                response,
                `No search results on ${venue.url}`,
              );
            }
            return page.content();
          },
          // An hourly probe must not replay an earlier cycle's results.
          { disableCache: true },
        );
        countRequest();

        const { films, byDate } = tally(html);
        const dates = Object.keys(byDate).sort();
        if (dates.length === 0) {
          rows.push({ venue: venue.id, reason: { kind: "venue-dark" } });
          continue;
        }

        rows.push({
          venue: venue.id,
          counts: {
            performances: dates.reduce((total, d) => total + byDate[d], 0),
            films: films.size,
            dates: dates.length,
          },
          // Sorted so consecutive cycles diff cleanly.
          byDate: Object.fromEntries(dates.map((d) => [d, byDate[d]])),
        });
      } catch (error) {
        // Each venue has its own page load, so a failure stays with that venue.
        countRequest();
        rows.push({ venue: venue.id, reason: reasonFor(error) });
      }
    }
    return rows;
  });

  return finalise(results);
}

module.exports = health;
