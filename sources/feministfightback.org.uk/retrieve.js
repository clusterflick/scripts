const {
  retrievePaginatedListView,
} = require("../../common/tribe-events/retrieve");
const { domain, url } = require("./attributes");

// The site runs The Events Calendar, and the film club is one category among
// the collective's meetings, workshops and protests, so the list view is
// walked for that category alone. It lists upcoming events only.
const LIST_PATH = "/events/category/feminist-fightback-film-club/list/";

const buildParams = (page, { tvn1, tvn2 }) =>
  new URLSearchParams({
    pu: LIST_PATH,
    u: page === 1 ? LIST_PATH : `${LIST_PATH}page/${page}/`,
    smu: "true",
    tvn1,
    tvn2,
  });

async function retrieve() {
  return retrievePaginatedListView({
    domain,
    initialPageUrl: url,
    buildParams,
  });
}

module.exports = retrieve;
