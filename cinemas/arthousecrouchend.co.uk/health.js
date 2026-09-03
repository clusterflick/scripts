const createListingTotalsHealth = require("../../common/listing-totals-health");
const { domain } = require("./attributes");

// Films only, and not for want of looking. The venue is ticketed by Savoy
// Systems - the listing's posters are served from images.savoysystems.co.uk and
// its booking links point at arthousecrouchend.savoysystems.co.uk - but that
// backend serves an out-of-date-browser shell with no listing in it, so the
// `var Events` blob the other Savoy venues are probed from isn't there. The
// venue's own booking-now page carries no date or time markup at all.
//
// Its streamed-theatre page is the odd one out: it does carry `event-date` and
// `prog-times` on each entry. Counting dates for half a programme would report
// a number that means nothing, so both pages are counted the same way - but
// that half is where to start if this is ever upgraded.
//
// So 2 requests against a retrieve's 7, and no date axis.
module.exports = createListingTotalsHealth({
  pages: () => [`${domain}/booking-now/`, `${domain}/streamed-theatre/`],
  listing: ".performance",
  entry: ".performance",
  // Films link from `.programme > a`, streamed theatre from
  // `.event-show-title a` - the same pair the retrieve reads, first match only.
  link: ".programme > a, .event-show-title a",
});
