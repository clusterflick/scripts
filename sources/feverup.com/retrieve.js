const cheerio = require("cheerio");
const { fetchText, fetchJson } = require("../../common/utils.js");
const attributes = require("./attributes");
const { extractTransferState, extractPlanDetail } = require("./utils");

function getSessionsApiUrl(planId, placeId, date) {
  return `https://feverup.com/api/4.2/plans/${planId}/place/${placeId}/sessions_for_date/${date}/?exclude_sessions_as_add_ons=true&include_add_ons=true`;
}

function extractCalendarDates(transferState) {
  const ticketTransferState =
    transferState["ticket-selector-config"]?.transferState;

  const dates = new Set();
  for (const [key, value] of Object.entries(ticketTransferState || {})) {
    if (!key.startsWith("PlanCalendarSelectorService.getCalendarAvailability:"))
      continue;
    for (const date of Object.keys(value.dates || {})) {
      dates.add(date);
    }
  }

  return [...dates].sort();
}

async function fetchSessionsForPlan(planId, places, dates) {
  const sessions = {};
  for (const place of places) {
    for (const date of dates) {
      const url = getSessionsApiUrl(planId, place.id, date);
      try {
        const data = await fetchJson(url);
        sessions[`${place.id}:${date}`] = data;
      } catch (e) {
        console.log(
          `! Error fetching sessions for plan ${planId}, place ${place.id}, date ${date} - ${e.message}`,
        );
      }
    }
  }
  return sessions;
}

async function retrieve() {
  const movieListPage = await fetchText(attributes.url);

  const $ = cheerio.load(movieListPage);
  const movieUrls = $('.fv-wpf-plan-list a[data-testid="fv-plan-card"]')
    .filter(
      (i, elem) =>
        $(elem).find('[data-testid="fv-plan-location__name"]').length > 0,
    )
    .map((i, elem) => {
      const href = $(elem).attr("href");
      return href.startsWith("http") ? href : `${attributes.domain}${href}`;
    })
    .get();

  const moviePages = {};
  const sessionPages = {};
  for (const [, url] of movieUrls.entries()) {
    const html = await fetchText(url);
    moviePages[url] = html;

    const transferState = extractTransferState(html, url);
    const planDetail = extractPlanDetail(transferState, url);
    const dates = extractCalendarDates(transferState);

    if (dates.length > 0) {
      const sessions = await fetchSessionsForPlan(
        planDetail.id,
        planDetail.places,
        dates,
      );
      sessionPages[url] = sessions;
    }
  }

  return { movieListPage, moviePages, sessionPages };
}

module.exports = retrieve;
