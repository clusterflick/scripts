const { retrieveEventPages } = require("../../common/localgov-drupal/retrieve");
const { domain } = require("./attributes");

// Kingston's events have no film category, so screenings are found by what
// they call themselves. The search covers past events as well as upcoming
// ones; transform drops performances that have already happened.
const SEARCH_TERMS = ["film", "screening", "cinema", "movie"];

async function retrieve() {
  return retrieveEventPages({
    domain,
    listUrls: SEARCH_TERMS.map(
      (term) => `${domain}/events/search?search=${encodeURIComponent(term)}`,
    ),
    listSelector: ".view-localgov-events-search",
    eventLinkSelector: ".event-card h2 a",
  });
}

module.exports = retrieve;
