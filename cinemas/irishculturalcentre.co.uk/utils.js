const cheerio = require("cheerio");
const { getText } = require("../../common/utils");

// A listing card's date is the first paragraph under the title and its time
// the second - the same two the transform reads.
const getCardDetails = ($, post) => $(post).find(".project-bottom > p");
const getCardDate = ($, post) => getText(getCardDetails($, post).eq(0));
const getCardUrl = ($, post) => $(post).find("a.project-link").attr("href");
const getCardTitle = ($, post) => getText($(post).find(".project-bottom h3"));

function getUndatedEvents(listingPage) {
  const $ = cheerio.load(listingPage);
  return $(".project-post")
    .filter((_, post) => !getCardDate($, post))
    .map((_, post) => getCardTitle($, post))
    .get();
}

// On 9th November 2026 the site began rendering every event's date and time
// blank: every card on a filtered listing, and "Thu 01 January 1970" on every
// event page. The unfiltered What's On page still carried them, because it is
// served from the host's page cache (`cache-provider: CLOUDWAYS-CACHE-DE`,
// last modified before the dates broke) while a filtered listing, with a query
// string, is rendered fresh.
//
// So the filtered listing still says which films are on, and the cached page
// says when. Each undated card takes its date and time paragraphs from the card
// on the full listing linking to the same event. A card the full listing can't
// date fails the retrieve: there is nothing else to read a date from, and a
// guess would be a showing at the wrong time.
function backfillListingDates(listingPage, fullListingPage) {
  const $ = cheerio.load(listingPage);
  const $full = cheerio.load(fullListingPage);

  const fullCards = new Map();
  $full(".project-post").each((_, post) => {
    if (getCardDate($full, post)) {
      fullCards.set(getCardUrl($full, post), post);
    }
  });

  const missing = [];
  $(".project-post").each((_, post) => {
    if (getCardDate($, post)) return;

    const source = fullCards.get(getCardUrl($, post));
    const target = getCardDetails($, post);
    if (!source || target.length < 2) {
      missing.push(getCardTitle($, post));
      return;
    }
    const details = getCardDetails($full, source);
    target.eq(0).replaceWith($full.html(details.eq(0)));
    target.eq(1).replaceWith($full.html(details.eq(1)));
  });

  if (missing.length > 0) {
    throw new Error(
      `Listing has ${missing.length} event(s) with no date, and the full listing doesn't date them either: ${missing.join(", ")}`,
    );
  }
  return $.html();
}

module.exports = { getUndatedEvents, backfillListingDates };
