const cheerio = require("cheerio");
const { getText } = require("../../common/utils");

// On 9th November 2026 the site served every card on the listing with its date
// and time blank, and every event page dated "Thu 01 January 1970", for a
// while before putting them back. With no date there is nothing to build a
// performance from, and the transform would fail on it - so the listing is
// refused here instead, where a retry can fetch it again once the site is
// fixed. One undated card is enough: the transform needs a date for every one.
function checkListingDates(html) {
  const $ = cheerio.load(html);
  const undated = $(".project-post")
    .filter((_, post) => !getText($(post).find(".project-bottom > p").eq(0)))
    .map((_, post) => getText($(post).find(".project-bottom h3")))
    .get();
  if (undated.length > 0) {
    throw new Error(
      `Listing has ${undated.length} event(s) with no date: ${undated.join(", ")}`,
    );
  }
}

module.exports = { checkListingDates };
