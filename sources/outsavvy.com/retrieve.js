const { fetchText } = require("../../common/utils.js");
const cheerio = require("cheerio");
const attributes = require("./attributes");

// OutSavvy has no film category - an event carries whatever hashtags its
// organiser typed - so the listing is swept a tag at a time. "screening" is not
// a synonym for "film" but a tag films get filed under *instead* of it: the
// Vagina Museum's "Wholly Trinity" screening is tagged screening, art, social,
// community and discussion, and never film. It brings non-film events with it -
// drag viewing parties, a Mean Girls club night - which costs nothing, since
// findEvents keeps only the events sitting at a venue we hold.
//
// "cinema" and "documentary" were checked on 2026-08-31 and were strict subsets
// of "film", so they would cost a request each and add no events.
const LISTING_TAGS = ["film", "screening"];

// The one tag whose emptiness is meaningful. London always has film events on
// OutSavvy, so nothing under "film" means the listing has stopped answering in
// the shape we read rather than that there is nothing on - and an empty sweep
// is invisible downstream, where every venue simply reports no showings. The
// other tags are grab-bags that films land in incidentally and can legitimately
// come back sparse, so asserting on them would cry wolf.
const REQUIRED_TAG = "film";

const listingUrl = (tag) => `${attributes.domain}/hashtag/${tag}`;

async function retrieve() {
  const movieListPages = [];
  const filmUrls = new Set();

  for (const tag of LISTING_TAGS) {
    const movieListPage = await fetchText(listingUrl(tag));
    movieListPages.push(movieListPage);

    // The "Load More" button reveals cards that are already in the HTML, so a
    // single fetch holds the whole tag - there is nothing to page through.
    const $ = cheerio.load(movieListPage);
    const tagUrls = $("#eventscontent a")
      .map((i, elem) => `${attributes.domain}${$(elem).attr("href")}`)
      .get();

    if (tag === REQUIRED_TAG && tagUrls.length === 0) {
      throw new Error(
        `No events found under the "${tag}" hashtag at ${listingUrl(tag)} - the OutSavvy listing markup may have changed`,
      );
    }

    for (const url of tagUrls) filmUrls.add(url);
  }

  const moviePages = {};
  for (const url of filmUrls) {
    const html = await fetchText(url);
    moviePages[url] = html;
  }

  return { movieListPages, moviePages };
}

module.exports = retrieve;
