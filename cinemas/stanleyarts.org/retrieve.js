const {
  retrievePaginatedListView,
} = require("../../common/tribe-events/retrieve");
const { domain, url } = require("./attributes");

const buildParams = (page, { tvn1, tvn2 }) =>
  `u=%2Fevents%2Flist%2Fpage%2F${page}%2F%3Fhide_subsequent_recurrences%3D1%26tribe_eventcategory%255B0%255D%3D240&smu=true&tvn1=${tvn1}&tvn2=${tvn2}`;

async function retrieve() {
  return retrievePaginatedListView({
    domain,
    initialPageUrl: url,
    buildParams,
    maxPages: 10,
  });
}

module.exports = retrieve;
