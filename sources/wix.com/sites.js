// Wix has no platform-wide listing: every site runs its own copy of Wix Events,
// so each organiser is added here by hand, as Ticket Tailor's slugs are.
//
// - `domain`: the site, as its own links write it.
// - `listingPages`: the pages that carry its events widget. A site places the
//   widget wherever it likes, and may filter it to some of its events, so name
//   every page needed to see the London ones.
// - `note`: who is putting the screening on, when the site isn't the venue.
// - `filmOrganiser`: every event the site lists is a screening, so a venue that
//   filters its sourced listings on film wording keeps them all.
const SITES = [
  {
    // Super Shorts runs editions in London, New York and Los Angeles, each on
    // its own tickets page. London is at BFI Stephen Street.
    domain: "https://www.supershorts.org",
    listingPages: ["/london-tickets"],
    note: "Part of Super Shorts Film Festival",
    filmOrganiser: true,
  },
];

module.exports = SITES;
