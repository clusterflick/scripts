const cheerio = require("cheerio");

// Angular serialises its server-side render state into the page with the JSON's
// own punctuation escaped, so the blob survives inside the HTML document.
// Unescape in a single pass: `&a;` decodes to `&`, and rescanning would let that
// `&` pair up with whatever follows it and decode a second time.
const STATE_ENTITIES = { "&a;": "&", "&q;": '"', "&l;": "<", "&g;": ">" };

/**
 * Parse the transfer state JSON from a Fever page's HTML.
 */
function extractTransferState(html, url) {
  const $ = cheerio.load(html);
  // Fever has changed this id's casing before (serverApp-state ->
  // serverapp-state), so match case-insensitively rather than pin to one.
  const scriptEl = $('script[id="serverapp-state" i]');
  if (!scriptEl.length) {
    throw new Error(`Missing script#serverapp-state in page: ${url}`);
  }

  return JSON.parse(
    scriptEl.html().replace(/&[aqlg];/g, (entity) => STATE_ENTITIES[entity]),
  );
}

/**
 * Extract the grid of plans from a listing page's transfer state. Fever calls a
 * listing a "what plan filter", and renders the first page of its grid into the
 * page; the rest is paged through the plan grid API, which needs the tracker id
 * issued alongside it.
 */
function extractPlanGrid(transferState, url) {
  const skeletonKey = Object.keys(transferState).find((key) =>
    key.startsWith("WhatPlanFilterService.getWPFSkeleton."),
  );
  if (!skeletonKey) {
    throw new Error(`Missing what plan filter skeleton in page: ${url}`);
  }

  const { recommendation_tracker_id: trackerId, skeleton } =
    transferState[skeletonKey];
  const grid = (skeleton || []).find(({ type }) => type === "plan_grid");
  if (!grid) {
    throw new Error(`Missing plan grid in page: ${url}`);
  }

  const { plans, has_multiple_pages: hasMultiplePages } = grid.content;
  return { trackerId, plans: plans || [], hasMultiplePages };
}

/**
 * Extract unique session times from an iterable of session responses.
 * Each response has level.items[] (time slots) with nested session items
 * (ticket tiers) that share the same start/end time.
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
  extractPlanGrid,
  extractSessionTimes,
};
