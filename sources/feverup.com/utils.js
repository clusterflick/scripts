const cheerio = require("cheerio");

/**
 * Parse the Astro transfer state JSON from a Fever page's HTML.
 */
function extractTransferState(html, url) {
  const $ = cheerio.load(html);
  const scriptEl = $("script#astro-tools-transfer-state");
  if (!scriptEl.length) {
    throw new Error(
      `Missing script#astro-tools-transfer-state in page: ${url}`,
    );
  }

  return JSON.parse(scriptEl.html());
}

/**
 * Extract the plan detail from the transfer state, throwing if missing.
 */
function extractPlanDetail(transferState, url) {
  const planDetail = transferState["page-config"]?.planDetail;
  if (!planDetail) {
    throw new Error(`Missing page-config.planDetail in page: ${url}`);
  }
  return planDetail;
}

/**
 * Extract unique session times from an iterable of session responses.
 * Each response has level.items[] (time slots) with nested session items
 * (ticket tiers) that share the same start/end time.
 * Works for both the sessions API responses and the LevelTicketSelectorLoader
 * entries in the HTML transfer state.
 */
function extractSessionTimes(sessionResponses) {
  const sessions = [];
  for (const response of sessionResponses) {
    const timeItems = response?.level?.items || [];
    for (const timeItem of timeItems) {
      const sessionItems = timeItem?.level?.items || [];
      for (const session of sessionItems) {
        const { starts_at_iso, ends_at_iso } = session.value || {};
        if (starts_at_iso) {
          sessions.push({ startsAt: starts_at_iso, endsAt: ends_at_iso });
        }
      }
    }
  }

  // Deduplicate by start time (different ticket tiers share the same time slot)
  const seen = new Set();
  return sessions.filter(({ startsAt }) => {
    if (seen.has(startsAt)) return false;
    seen.add(startsAt);
    return true;
  });
}

module.exports = {
  extractTransferState,
  extractPlanDetail,
  extractSessionTimes,
};
