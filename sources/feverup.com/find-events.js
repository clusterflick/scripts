const path = require("node:path");
const { parseISO, differenceInMinutes } = require("date-fns");
const {
  readJSON,
  generateShowingId,
  createAccessibility,
  createOccasions,
  createFormat,
  createOverview,
  createPerformance,
} = require("../../common/utils");
const attributes = require("./attributes");
const { venueMatchesCinema } = require("../../common/source-utils");
const { isNotNonFilmEvent } = require("../../common/is-non-film-event");
const { extractSessionTimes } = require("./utils");

function getPlanUrl(planId) {
  return `${attributes.domain}/m/${planId}`;
}

function convertFeverEvent(url, planDetail, sessions) {
  const firstSession = sessions[0];
  const duration =
    firstSession?.endsAt && firstSession?.startsAt
      ? differenceInMinutes(
          parseISO(firstSession.endsAt),
          parseISO(firstSession.startsAt),
        )
      : undefined;

  return {
    showingId: generateShowingId(attributes, planDetail.id),
    title: planDetail.name,
    url,
    overview: createOverview({ duration }),
    performances: sessions.map(({ startsAt }) => {
      const date = parseISO(startsAt);
      return createPerformance({
        date,
        url,
        accessibility: createAccessibility(
          planDetail.name,
          {},
          planDetail.description,
        ),
        format: createFormat(planDetail.name, {}, planDetail.description),
        occasions: createOccasions(
          planDetail.name,
          {},
          planDetail.description,
          { date },
        ),
      });
    }),
    matchingHints: { overview: planDetail.description },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "feverup.com");

  let planDetails = {};
  let sessionPages = {};
  try {
    const data = await readJSON(dataSrc);
    planDetails = data.planDetails || {};
    sessionPages = data.sessionPages || {};
  } catch {
    // Source data may not always be available or required
  }

  const results = [];
  for (const [planId, planDetail] of Object.entries(planDetails)) {
    const places = (planDetail.places || []).filter(
      ({ name, latitude, longitude, address }) =>
        venueMatchesCinema(
          cinema,
          name,
          { lat: latitude, lon: longitude },
          { eventAddress: address },
        ),
    );
    if (places.length === 0) continue;

    // A plan's sessions are retrieved per place, keyed "<place id>:<date>", and
    // a plan can run at several venues we hold. Only this cinema's places are
    // its sessions - reading the whole plan would hand it the other venues'
    // dates as its own.
    const placeIds = new Set(places.map(({ id }) => `${id}`));
    const planSessionPages = Object.entries(sessionPages[planId] || {})
      .filter(([key]) => placeIds.has(key.split(":")[0]))
      .map(([, page]) => page);

    // Sessions are only retrieved for plans at a venue we hold, so a plan
    // without any is one whose dates have passed rather than an unknown venue.
    const sessions = extractSessionTimes(planSessionPages);
    if (sessions.length === 0) continue;

    results.push(convertFeverEvent(getPlanUrl(planId), planDetail, sessions));
  }

  // Discovery reads the city's whole catalogue rather than a film category, so
  // a venue we hold for its cinema also offers up its exhibitions and classes -
  // an immersive exhibit running continuous entry slots contributes hundreds of
  // performances on its own. Drop the ones we know aren't films.
  return results.filter(isNotNonFilmEvent);
}

module.exports = findEvents;
