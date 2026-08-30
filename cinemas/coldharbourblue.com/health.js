const createHealth = require("../../common/tribe-events/health");
const { domain } = require("./attributes");

// The retrieve walks the month view, a call per month for a year ahead, and
// then opens every event's own page for its off-site booking link - 42 requests
// the day this was written. The probe walks the list view instead: the same
// plugin, the same nonce and the same view endpoint, but paginated over what is
// coming up rather than a fixed year, which was 18 events over 2 pages. So 3
// requests, at the cost of not exercising the month view's own parameters.
const buildParams = (page, { tvn1, tvn2 }) =>
  new URLSearchParams({
    pu: "/events/list/",
    u: page === 1 ? "/events/list/" : `/events/list/page/${page}/`,
    smu: "true",
    tvn1,
    tvn2,
  });

module.exports = createHealth({
  domain,
  initialPageUrl: `${domain}/events/list/`,
  buildParams,
});
