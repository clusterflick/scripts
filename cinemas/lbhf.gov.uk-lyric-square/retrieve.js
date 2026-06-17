const {
  retrievePaginatedListView,
} = require("../../common/tribe-events/retrieve");

// Lyric Square's events are programmed and listed by the Hammersmith BID, whose
// site runs the Tribe "The Events Calendar" plugin — separate from the council's
// own Lyric Square page used as the venue identity.
const listingDomain = "https://hammersmithbid.co.uk";

const buildParams = (page, { tvn1, tvn2 }) => {
  const path = page === 1 ? "/calendar/list/" : `/calendar/list/page/${page}/`;
  return new URLSearchParams({
    pu: "/calendar/list/",
    u: path,
    smu: "true",
    tvn1,
    tvn2,
  });
};

async function retrieve() {
  return retrievePaginatedListView({
    domain: listingDomain,
    initialPageUrl: `${listingDomain}/calendar/list/`,
    buildParams,
  });
}

module.exports = retrieve;
