const { format } = require("date-fns");

// Venues we know cannot list anything, and the window in which they can't.
// Usually that is a venue that is dark; it can also be one whose doors are open
// but whose listings have gone out of reach, as a box office mid-upgrade is.
// A venue listed here transforms to nothing when its listings come back empty,
// instead of failing the run: an empty response from a venue we already know
// cannot answer is the truth about it, not evidence the scrape has broken. The
// `reason` says which kind of entry it is.
//
// The health probe reads the same list, and needs it for more than empty
// listings: a chain drops a shut venue from its own site list as readily as it
// empties its listings, and a tracked id missing from that list is otherwise
// the probe's hardest failure. See scripts/health/stand-down-for-closure.js.
//
// Everything here is temporary. An entry only applies inside its own window, so
// the venue goes back to failing loudly the moment the closure is meant to be
// over - a carve-out left behind by accident cannot quietly swallow a real
// breakage. Delete lapsed entries.
//
// The window is the announced closure and nothing more. A chain sells tickets
// ahead of the date, so listings come back before the doors do: the venue
// usually stops being empty part-way through its own window, and the entry
// simply stops mattering. Padding the end is therefore the wrong way round -
// all it buys is days in which a real breakage looks like the closure. Still
// empty once the venue is meant to be open is worth a red job either way,
// whether the works overran or the scrape broke.
//
// Every entry cites where the closure was announced. Listings simply being
// empty is never the evidence - that is the failure this carves an exception
// out of, not a reason to add one.
//
// Dates are inclusive `yyyy-MM-dd`, read in the pipeline's timezone
// (Europe/London).
const expectedClosures = [
  {
    venue: "canarywharf.com-summer-screens",
    from: "2026-09-01",
    until: "2027-04-30",
    // "Canary Wharf's Summer Screens returns [...] from Thursday 4 June until
    // Tuesday 1 September 2026." The estate deletes the season's event page
    // once the run is over rather than emptying it, so out of season the
    // venue's URL 404s.
    // https://cwg.com/press-release/canary-wharfs-summer-screens-return-with-3-month-programme-of-free-films-sports-and-games-29426/
    //
    // The window ends in April, not at the next season's opening night: the
    // page is season-specific (`/whats-on/film-club-2/` was 2026's), so next
    // year's listings arrive under a slug this venue does not yet point at.
    // Ending the window around when the 2026 season was announced (29 April)
    // turns that stale URL red while there is still time to re-point it,
    // instead of swallowing it until June.
    reason: "out of season, next Summer Screens season expected June 2027",
  },
  {
    venue: "myvue.com-finchley-road",
    from: "2026-08-28",
    until: "2026-09-04",
    // "Vue will be temporarily closed from Friday 28th August - Friday 4th
    // September for refurbishment works."
    // https://www.o2centre.co.uk/en/play-listing/vue
    reason: "refurbishment works, reopening Saturday 5th September 2026",
  },
  {
    venue: "royalalberthall.com",
    from: "2026-09-13",
    until: "2026-09-14",
    // "In order to keep our box office running smoothly we will be undertaking
    // a major upgrade to our booking system. Due to this, we will be unable to
    // process bookings for tickets, tours and restaurants online, over the
    // phone or in person from Sunday 13 - Monday 14 September. [...] We will be
    // able to take bookings online and over the phone again from Tuesday 15
    // September."
    // https://www.royalalberthall.com/about-the-hall/news/box-office-update
    //
    // Not a closure: the Hall is open and every film stays listed as On Sale.
    // The upgrade takes the dates with it - each event in the feed, in every
    // category and not just Film, comes back with an empty `Performances` - so
    // the transform holds 20 films and not one bookable showing. Recovery
    // carries the previous release's listings through the window, and can only
    // do so because this entry stops the transform throwing first.
    reason: "box office upgrade, bookings reopening Tuesday 15 September 2026",
  },
  {
    venue: "fulhampier.com",
    from: "2026-09-17",
    until: "2026-09-17",
    // Not a closure, and not an announcement either - the only entry here whose
    // evidence is our own observation, which is worth saying plainly. The venue
    // is open; its domain is what has gone. fulhampier.com delegates to Azure
    // DNS, and since roughly 01:00 today all four of NS1-05.AZURE-DNS.COM and
    // its siblings answer REFUSED for every name in the zone, so the site
    // resolves for nobody and the retrieve's navigation fails with
    // ERR_NAME_NOT_RESOLVED. Confirmed against both 1.1.1.1 and 8.8.8.8 ("Name
    // servers refused query (lame delegation?)"), and the registration is paid
    // to 2028-01-31, so this is a zone deleted or lapsed on their side rather
    // than a domain that has gone.
    //
    // One day, not a week. Nothing observed says when the zone comes back, so
    // any longer window would be invented; this one buys the run that is
    // blocked right now - a release for the other 434 venues, with transform's
    // recovery carrying Fulham Pier's own listings forward from the previous
    // release - and makes tomorrow a fresh decision rather than a window
    // quietly running on. While the domain is dark recovery's URL check cannot
    // reach the listings either, so what it carries is unverifiable and a
    // screening cancelled today would stay up: a second day of that is a choice
    // someone should make deliberately.
    reason: "DNS delegation failed, listings unreachable",
  },
  {
    venue: "stanleyarts.org",
    from: "2026-09-26",
    until: "2026-09-26",
    // Not a closure, and like Fulham Pier's entry the evidence is observation
    // rather than an announcement. The venue is open; its site answers nobody.
    // stanleyarts.org is hosted on SiteGround, whose bot protection has been
    // refusing every request since at least 03:14 today: our runner gets a 429
    // on the first page of the retrieve, on every attempt and every re-run;
    // elsewhere every URL on the domain - the home page included, with or
    // without www, over http or https - is a 202 "Robot Challenge Screen"
    // (`sg-captcha: challenge`) that a headless browser does not clear; and
    // the site would not load in an ordinary browser on either a home or a
    // mobile network.
    //
    // One day, for the same reason as Fulham Pier's: nothing observed says
    // when it lifts, and this buys the run that is blocked now - a release for
    // every other venue, with transform's recovery carrying Stanley Arts' two
    // listings forward from the previous release - and makes tomorrow a fresh
    // decision. Recovery cannot verify them past the same wall, so a screening
    // cancelled today would stay up.
    reason: "SiteGround refusing all requests, listings unreachable",
  },
];

// The closure covering this venue today, or undefined if it has none - so a
// caller can say in the log which closure it is standing down for.
function getExpectedClosure(venueId, now = new Date()) {
  const today = format(now, "yyyy-MM-dd");
  return expectedClosures.find(
    ({ venue, from, until }) =>
      venue === venueId && from <= today && today <= until,
  );
}

module.exports = { expectedClosures, getExpectedClosure };
