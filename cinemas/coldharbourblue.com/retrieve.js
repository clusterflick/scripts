const { addMonths, format } = require("date-fns");
const { fetchText } = require("../../common/utils");
const {
  extractNonce,
  fetchViewHtml,
} = require("../../common/tribe-events/retrieve");
const { extractJsonLdEvents } = require("../../common/tribe-events/transform");
const { domain } = require("./attributes");

function getMonthsToFetch() {
  const months = [];
  const currentDate = new Date();

  for (let i = 0; i < 12; i++) {
    const from = addMonths(currentDate, Math.max(0, i - 1));
    const to = addMonths(currentDate, i);
    months.push([format(from, "yyyy-MM"), format(to, "yyyy-MM")]);
  }

  return months;
}

async function retrieve() {
  const monthPageUrl = `${domain}/events/month/`;
  const html = await fetchText(monthPageUrl);
  const { tvn1, tvn2 } = extractNonce(html);

  const months = getMonthsToFetch();
  const monthPages = [];
  for (const [from, to] of months) {
    const params = new URLSearchParams({
      pu: `/events/month/${from}/`,
      u: `/events/month/${to}/`,
      smu: "true",
      tvn1,
      tvn2,
    });

    monthPages.push(await fetchViewHtml(domain, params));
  }

  // Some events are ticketed off-site, and that booking link only appears on
  // the event's own page, so each event page is fetched alongside the months.
  const eventPageUrls = new Set(
    monthPages.flatMap((monthPage) =>
      extractJsonLdEvents(monthPage).map(({ url }) => url),
    ),
  );

  const eventPages = {};
  for (const eventPageUrl of eventPageUrls) {
    eventPages[eventPageUrl] = await fetchText(eventPageUrl);
  }

  return { monthPages, eventPages };
}

module.exports = retrieve;
