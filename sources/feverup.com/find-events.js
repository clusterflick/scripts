const path = require("node:path");
const { parseISO, differenceInMinutes } = require("date-fns");
const {
  readJSON,
  generateShowingId,
  createAccessibility,
  createFormat,
  createOverview,
  createPerformance,
} = require("../../common/utils");
const attributes = require("./attributes");
const { venueMatchesCinema } = require("../../common/source-utils");
const {
  extractTransferState,
  extractPlanDetail,
  extractSessionTimes,
} = require("./utils");

/**
 * Get session times from the transfer state's LevelTicketSelectorLoader
 * entries (only covers the pre-rendered default date).
 */
function getTransferStateSessions(transferState) {
  const ticketTransferState =
    transferState["ticket-selector-config"]?.transferState;
  if (!ticketTransferState) return [];

  const loaderEntries = Object.entries(ticketTransferState)
    .filter(([key]) =>
      key.startsWith(
        "LevelTicketSelectorLoader.getPlanSessionsForPlaceAndDate:",
      ),
    )
    .map(([, value]) => value);

  return extractSessionTimes(loaderEntries);
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
    performances: sessions.map(({ startsAt }) =>
      createPerformance({
        date: parseISO(startsAt),
        url,
        accessibility: createAccessibility(
          planDetail.name,
          {},
          planDetail.description,
        ),
        format: createFormat(planDetail.name, {}, planDetail.description),
      }),
    ),
    matchingHints: { overview: planDetail.description },
  };
}

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", "feverup.com");

  let moviePages = {};
  let sessionPages = {};
  try {
    const data = await readJSON(dataSrc);
    moviePages = data.moviePages || {};
    sessionPages = data.sessionPages || {};
  } catch {
    // Source data may not always be available or required
  }

  const results = [];
  for (const [url, html] of Object.entries(moviePages)) {
    const transferState = extractTransferState(html, url);
    const planDetail = extractPlanDetail(transferState, url);

    const places = planDetail.places || [];
    const matchesVenue = places.some(({ name, latitude, longitude, address }) =>
      venueMatchesCinema(
        cinema,
        name,
        { lat: latitude, lon: longitude },
        { eventAddress: address },
      ),
    );
    if (!matchesVenue) continue;

    // Prefer session data fetched via API (covers all dates), fall back to
    // the transfer state embedded in the HTML (only the default date)
    const apiSessionData = sessionPages[url];
    const sessions = apiSessionData
      ? extractSessionTimes(Object.values(apiSessionData))
      : getTransferStateSessions(transferState);

    if (sessions.length === 0) continue;

    results.push(convertFeverEvent(url, planDetail, sessions));
  }

  return results;
}

module.exports = findEvents;
