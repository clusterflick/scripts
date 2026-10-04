const { retrieveEventPages } = require("../../common/localgov-drupal/retrieve");
const { domain, url } = require("./attributes");

async function retrieve() {
  return retrieveEventPages({
    domain,
    listUrls: [url],
    listSelector: ".view-southwark-events",
    eventLinkSelector: ".views-row a.card-link",
  });
}

module.exports = retrieve;
