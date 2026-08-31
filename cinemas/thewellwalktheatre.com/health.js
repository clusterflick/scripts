const { retrieveExperiences } = require("../../common/beyonk");
const { isFilmEvent } = require("../../common/is-film-event");
const {
  probeText,
  startObservation,
  withChallengeRetry,
} = require("../../common/health-probe");
const { beyonkOrganisationId } = require("./attributes");

// A single venue rather than a chain, so this hangs off the cinema module
// alongside `retrieve` and `transform` rather than sitting under `common/`.
//
// This is the largest saving of any probe here. The retrieve pays a detail call
// and then twelve months of availability for every experience the shop sells -
// 53 requests - because Beyonk serves availability one calendar month at a time
// and a run can sit in a month with nothing either side of it. The shop's own
// experience list is one request, and it carries what this needs.
//
// No dates, therefore: they are the thing those 52 other requests buy. This
// catches the shop breaking, the organisation id going stale, and the film
// programme emptying.
const GRANULARITY = "film-totals";

// Beyonk carries no category to filter on - a film and a Crafternoon are the
// same kind of thing to it - so film is told from the rest by reading the
// listing, exactly as the transform does and from the same two fields. The
// shop's item carries the name and the description the transform tests, so this
// is the same call made on the same evidence rather than an approximation of it.
const isFilm = ({ type, name, description }) =>
  type === "experience" && isFilmEvent(`${name} ${description ?? ""}`);

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);
  const [venue] = venues;

  let films;
  try {
    const items = await withChallengeRetry(
      () =>
        retrieveExperiences(beyonkOrganisationId, (url) => {
          countRequest();
          return probeText(url);
        }),
      venue.id,
    );

    // Groups - folders of other experiences, carrying no schedule of their own -
    // are listed alongside experiences and are dropped by `isFilm`.
    films = items.filter(isFilm).length;
  } catch (error) {
    return finalise([{ venue: venue.id, reason: reasonFor(error) }]);
  }

  // The shop answered with a list that holds no films. A run being over or not
  // yet on sale looks exactly like this, and so does a theatre with no cinema
  // programme this month, which is ordinary here - the venue sells craft
  // afternoons and children's readings from the same shop.
  if (films === 0) {
    return finalise([
      { venue: venue.id, reason: { kind: "no-listings-found" } },
    ]);
  }

  // A film the shop lists but has no dates on is counted here and dropped by
  // the retrieve, which finds out by asking for its detail. That is the trade
  // this probe makes: the count is what the shop advertises, not what is on
  // sale.
  return finalise([{ venue: venue.id, counts: { films } }]);
}

module.exports = health;
