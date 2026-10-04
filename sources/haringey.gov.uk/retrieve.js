const { retrieveEventPages } = require("../../common/localgov-drupal/retrieve");
const { domain, url } = require("./attributes");

async function retrieve() {
  return retrieveEventPages({
    domain,
    listUrls: [url],
    listSelector: ".view-localgov-events-listing .view-content",
    eventLinkSelector: ".event-teaser__title a",
  });
}

module.exports = retrieve;
