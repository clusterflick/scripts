const cheerio = require("cheerio");
const {
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("./health-probe");

// The shape a probe takes when the venue's listing carries no date to count -
// see `docs/health.md`. It reads one or more listing pages, checks the listing
// itself is there, and counts the distinct entries linked from it.
//
// A venue reaches for this only when its cheap endpoint genuinely has no dates,
// and its own `health.js` is expected to say why in a comment: that reason is
// venue-specific knowledge and the only place it lives. What is shared here is
// the mechanics, which are identical everywhere and would otherwise be a
// seventh copy.
const GRANULARITY = "film-totals";

/**
 * Build a `health` export for a venue whose listing has no date axis.
 *
 * @param {object} config
 * @param {(venue: object) => string[]} config.pages - the listing urls to read,
 *   which is what the venue's own `retrieve` starts from.
 * @param {string} config.listing - a selector for the listing itself. Its
 *   absence is the page having changed shape; its presence with no entries is a
 *   venue with nothing on. That distinction is the whole point of asking for it
 *   separately from the entries.
 * @param {string} config.entry - a selector for each entry in the listing.
 * @param {($entry: object) => boolean} [config.isFilm] - keeps only the entries
 *   a venue's own listing marks as film, where it marks any. A general what's-on
 *   with no such marking counts as it stands and names its count `listings`
 *   instead - dropping the rest would be a judgement about listings rather than
 *   an observation about the source.
 * @param {string|($entry: object) => string|undefined} config.link - how to
 *   read the entry's link. A selector is taken within each entry, first match
 *   only, the way the retrieves read the same markup - counting links across
 *   the page instead would double an entry that carries two of them. A function
 *   is for a listing whose link is not inside its entry: London Bridge City's
 *   entry is a summary wrapped in the card's link rather than wrapping it.
 * @param {string} [config.countName] - what the entries are, as the row and the
 *   log should name them. `films` where the listing is the venue's film
 *   programme; `listings` where it is a general what's-on carrying more than
 *   film.
 * @param {number[]} [config.acceptStatuses] - passed to `probeText`, for a
 *   listing served under a status the source means nothing by.
 */
const createListingTotalsHealth = ({
  pages,
  listing,
  entry,
  link,
  isFilm,
  countName = "films",
  acceptStatuses,
}) =>
  async function health(venues) {
    const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);
    const [venue] = venues;

    // Identity is the entry's link rather than its title, because a venue lists
    // the same film twice under a strand name, and the retrieve keys the pages
    // it opens on the same href.
    const entries = new Set();
    const unlinked = [];

    try {
      // Wrapped as one unit rather than per page: a challenge part-way through
      // has to start again, not resume.
      await withChallengeRetry(async () => {
        entries.clear();
        unlinked.length = 0;

        for (const url of pages(venue)) {
          const html = await probeText(url, undefined, { acceptStatuses });
          countRequest();

          const $ = cheerio.load(html);
          if ($(listing).length === 0) {
            throw probeError(
              `No \`${listing}\` on ${url} - the listing may have changed shape`,
            );
          }

          $(entry).each(function () {
            const $item = $(this);
            if (isFilm && !isFilm($item)) return;

            const href =
              typeof link === "function"
                ? link($item)
                : $item.find(link).first().attr("href");
            if (href) entries.add(href);
            else unlinked.push(url);
          });
        }
      }, venue.id);

      // An entry the listing shows but doesn't link is a shape change: the
      // retrieve reads the same link to know what to open next.
      if (unlinked.length > 0) {
        throw probeError(
          `${unlinked.length} listing entr(y/ies) had no link (e.g. on ${unlinked[0]})`,
        );
      }
    } catch (error) {
      return finalise([{ venue: venue.id, reason: reasonFor(error) }]);
    }

    // The listing is there and empty, which is a venue with nothing on rather
    // than a listing that has broken - the check above is what tells them apart.
    if (entries.size === 0) {
      return finalise([
        { venue: venue.id, reason: { kind: "no-listings-found" } },
      ]);
    }

    return finalise([
      { venue: venue.id, counts: { [countName]: entries.size } },
    ]);
  };

module.exports = createListingTotalsHealth;
