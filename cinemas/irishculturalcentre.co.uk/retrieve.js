const { withCamoufoxSession } = require("../../common/get-page-with-camoufox");
const { getPageEscalating } = require("../../common/camoufox-escalation");
const { assertSelector } = require("../../common/utils");
const { id, url } = require("./attributes");

// The site sits behind a bot check that on 23rd October 2026 began answering
// the runner with a "verifying your connection" page under a 200, which carries
// none of the signals `classifyRefusal` knows. So the listing is tried with a
// plain fetch first and the session escalates to Camoufox when the real page
// doesn't come back - see `common/camoufox-escalation.js`.
//
// The Search & Filter results container is on the listing whether or not
// anything is showing, and a challenge page can't carry it - so it is what
// tells the real page apart, and what the browser waits for while the
// challenge clears. The listing's own cards can't do that job, since a
// listing with nothing on has none.
const PAGE_SELECTOR = ".search-filter-results";

async function retrieveListing(getPage) {
  const movieListPage = await getPageEscalating(getPage, url, `${id}-listing`, {
    selector: PAGE_SELECTOR,
  });
  assertSelector(movieListPage, ".project-post");
  return { movieListPage };
}

const retrieve = () => withCamoufoxSession(retrieveListing);

module.exports = retrieve;
