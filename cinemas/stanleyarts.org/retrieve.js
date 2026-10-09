const {
  retrievePaginatedListView,
} = require("../../common/tribe-events/retrieve");
const {
  retrievePaginatedListViewWithBrowser,
} = require("../../common/tribe-events/browser");
const { getExpectedClosure } = require("../../common/expected-closures");
const { id, domain, url } = require("./attributes");

const buildParams = (page, { tvn1, tvn2 }) =>
  `u=%2Fevents%2Flist%2Fpage%2F${page}%2F%3Fhide_subsequent_recurrences%3D1%26tribe_eventcategory%255B0%255D%3D240&smu=true&tvn1=${tvn1}&tvn2=${tvn2}`;

const listView = { domain, initialPageUrl: url, buildParams, maxPages: 10 };

// SiteGround challenges plain requests from some IPs while letting a browser on
// the same IP through, so a challenge escalates to Camoufox - see
// `common/tribe-events/browser.js`. Only the challenge: anything else would
// fail the same way in a browser.
async function retrieveListView() {
  try {
    return await retrievePaginatedListView(listView);
  } catch (error) {
    if (!error.siteGroundChallenge) throw error;

    console.log(
      "    - Challenged by SiteGround; retrying through Camoufox, which carries a browser fingerprint and can solve a challenge",
    );
    return await retrievePaginatedListViewWithBrowser(
      listView,
      `${id}-browser`,
    );
  }
}

async function retrieve() {
  try {
    return await retrieveListView();
  } catch (error) {
    // Stands down at retrieve for the same reason Fulham Pier's does: while the
    // site refuses every request the first page never loads, so there is no
    // retrieved data for a transform to find empty. Deliberately not narrowed
    // to the 429 - the challenge page is the same outage in another shape, and
    // the window is a single day with the swallowed error logged in full.
    const closure = getExpectedClosure(id);
    if (!closure) throw error;

    console.log(
      `      - ⚠️  Unable to retrieve ${id} - closed until ${closure.until} for ${closure.reason}: ${error.message}`,
    );
    return { movieListPages: [] };
  }
}

module.exports = retrieve;
