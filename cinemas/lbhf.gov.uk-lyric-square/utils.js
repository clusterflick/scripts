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

// The BID site sits behind a CDN that full-page-caches /calendar/list/ with a
// Tribe REST nonce baked in. A stale cached nonce is rejected (401) by the
// view endpoint, so cache-bust the initial fetch to force a fresh, valid nonce.
const getListingView = () => ({
  domain: listingDomain,
  initialPageUrl: `${listingDomain}/calendar/list/?nocache=${Date.now()}`,
  buildParams,
});

module.exports = { getListingView };
