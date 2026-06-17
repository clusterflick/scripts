const { addMonths, format } = require("date-fns");
const { fetchText } = require("../../common/utils");
const {
  extractNonce,
  fetchViewHtml,
} = require("../../common/tribe-events/retrieve");
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
  const apiResponses = [];
  for (const [from, to] of months) {
    const params = new URLSearchParams({
      pu: `/events/month/${from}/`,
      u: `/events/month/${to}/`,
      smu: "true",
      tvn1,
      tvn2,
    });

    const html = await fetchViewHtml(domain, params);
    apiResponses.push({ html });
  }

  return apiResponses;
}

module.exports = retrieve;
