const { domain } = require("./attributes");

// JW3's ticketing is Spektrix, under this client name.
const spektrixClient = "jw3";

// The venue's own what's-on, filtered to its cinema programme. Shared with the
// health probe, which reads the first page of the same listing to check the
// site still answers with a programme before counting one.
const getSearchUrl = (page = 1) =>
  `${domain}/whats-on?genres[]=19&max=27&page=${page}`;

const LISTING_LINK = ".eventCard .thumb a";

// The genre the site's `genres[]=19` filter corresponds to in Spektrix. Checked
// rather than assumed: the two agreed exactly - 18 events either way - on the
// day the health probe was written.
const CINEMA_GENRE = "Cinema";

module.exports = {
  spektrixClient,
  getSearchUrl,
  LISTING_LINK,
  CINEMA_GENRE,
};
