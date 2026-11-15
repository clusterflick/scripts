const { fetchJson, basicNormalize } = require("../../common/utils.js");
const { withCamoufoxSession } = require("../../common/get-page-with-camoufox");
const {
  isBotBlockText,
  isBotChallengeResponse,
} = require("../../common/bot-challenge");

const searchUrl = "https://api.dice.fm/unified_search";
const eventUrl = (id) => `https://api.dice.fm/events/${id}`;
const promoterUrl = (slug) =>
  `https://api.dice.fm/promoter_profiles/slug/${slug}`;

// Promoters whose screenings the search never reaches. A screening run inside a
// wider night is tagged as that night, and its name rarely says "film":
// Riot Party's "Riot LDN Xmas Social" at The Brixton Courtyard (2026-12-10)
// promised an erotic film screening in its description, but its only tag was
// `culture:social`. The promoter's profile lists its upcoming events whatever
// they are tagged, in the same section shape the search returns. Every event
// it lists is fetched, and find-events.js still keeps only those at a venue we
// hold. Add a promoter here when one of its screenings goes missing the same
// way, and say who it is: a slug nobody can attribute can never be removed.
const PROMOTERS = [
  // Riot Party, https://dice.fm/promoters/riot-party-dd2q
  "riot-party-dd2q",
];
const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "X-Client-Timezone": "Europe/London",
  "X-Api-Timestamp": "2024-03-25",
};

// The page the browser path borrows a browsing context from. Nothing is read out
// of it — it exists so the API calls below run from a real dice.fm document,
// carrying the browser's fingerprint and whatever clearance cookie Cloudflare
// has handed this session. DICE allows exactly that: measured 2026-09-18, the
// API answers a preflight from this origin with
// `access-control-allow-origin: https://dice.fm` and names every header above in
// `access-control-allow-headers`, so these are the same calls its own web app
// makes rather than something the browser is being talked into.
const SITE_URL = "https://dice.fm/";

// Next.js' mount point. Only the real document carries it and a Cloudflare
// interstitial never does, so it is what separates "the challenge has been
// solved" from "the interstitial is between reloads" — the distinction
// `sources/ticketsource.co.uk/retrieve.js` learned to make the hard way.
const SITE_SELECTOR = "#__next";

// Cloudflare can re-check partway through, which destroys the execution context
// under an in-flight `evaluate`. That isn't flakiness to retry blindly: settle
// on the new document and repeat the call. See the equivalent note in
// `sources/ticketsource.co.uk/retrieve.js`.
const CONTEXT_LOST = /Execution context was destroyed|frame was detached/i;
const EVALUATE_RETRIES = 2;

// Search results are trimmed down to what a listing card needs — no perm_name,
// promoter, description or venue coordinates — so they only decide which events
// are worth fetching in full.
const getSummariesFromResponse = (response) =>
  response.sections
    .filter((section) => section.section_type === "polymorphic_vertical")
    .flatMap((section) => section.items ?? [])
    .filter((item) => item.type === "event")
    .map((item) => item.event);

// Both paths make the same two calls, so they are named once here and the
// retrieval sequence below is written against them. Two transports rather than
// two retrievals: a browser copy of the paging and filtering would be free to
// drift from the one that runs every day, and the day it did we would be
// comparing a fallback's output against nothing.
const overFetch = {
  search: (body) =>
    fetchJson(searchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  event: (id) => fetchJson(eventUrl(id), { headers }),
  promoter: (slug) => fetchJson(promoterUrl(slug), { headers }),
};

const settleOnSite = async (page) => {
  try {
    await page.waitForSelector(SITE_SELECTOR, { state: "attached" });
  } catch {
    // A challenge we failed to solve is worth retrying; an outright block is
    // not, and calling it a challenge sends the next person looking for a puzzle
    // that was never offered. Both arrive here as the same timeout, so the page
    // body is the only thing that tells them apart.
    if (isBotBlockText(await page.content().catch(() => null))) {
      throw new Error(
        `Blocked outright (not challenged) at ${SITE_URL} — the request was ` +
          `refused, not scored. Check the Camoufox launch options before ` +
          `assuming the site changed.`,
      );
    }
    throw new Error(`Bot challenge page detected at ${SITE_URL}`);
  }
};

const requestFromPage = async (page, url, init) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await page.evaluate(
        async ({ url, init }) => {
          let response;
          try {
            response = await fetch(url, init);
          } catch (error) {
            // A Cloudflare block on the API host answers without CORS headers,
            // so it reaches us as an opaque "Failed to fetch" with no status to
            // report. Say which of the two it was rather than leaving a network
            // error to be read as the API being down.
            throw new Error(
              `Request to ${url} was refused before a response was readable ` +
                `(${error.message}) — the API host is blocking this session ` +
                `rather than challenging it.`,
            );
          }
          if (!response.ok) {
            throw new Error(
              `Failed to fetch ${url} - ${response.status} ${response.statusText}`,
            );
          }
          return response.json();
        },
        { url, init },
      );
    } catch (error) {
      if (attempt >= EVALUATE_RETRIES || !CONTEXT_LOST.test(error.message)) {
        throw error;
      }
      await settleOnSite(page);
    }
  }
};

const overBrowser = (page) => ({
  search: (body) =>
    requestFromPage(page, searchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  event: (id) => requestFromPage(page, eventUrl(id), { headers }),
  promoter: (slug) => requestFromPage(page, promoterUrl(slug), { headers }),
});

const fetchSummaries = async (transport, tag) => {
  const allSummaries = [];
  let cursor;

  do {
    const body = { count: 100, lat: 51.507653, lng: -0.107722, tag };
    if (cursor) body.cursor = cursor;

    const response = await transport.search(body);

    allSummaries.push(...getSummariesFromResponse(response));
    cursor = response.next_page_cursor;
  } while (cursor);

  return allSummaries;
};

// A promoter between nights legitimately has nothing upcoming, so no events is
// not an error. A slug that no longer resolves is: the promoter has renamed or
// gone, and PROMOTERS needs updating rather than quietly fetching nothing every
// day. So is a profile without the sections we read, or one that can't list
// everything in one answer, because nothing here reads a next page: the profile
// we have seen (riot-party-dd2q, 2026-11-15) sent `load_more: false` with all
// four of its events, and no further page has been seen to know how one is
// asked for.
const fetchPromoterSummaries = async (transport, slug) => {
  let response;
  try {
    response = await transport.promoter(slug);
  } catch (error) {
    // A 403 is the session being refused, which `retrieve` escalates on.
    if (error.status === 403) throw error;
    throw new Error(
      `DICE promoter "${slug}" could not be read (${error.message}). If ` +
        `the promoter has gone, PROMOTERS in sources/dice.fm/retrieve.js ` +
        `needs updating`,
      { cause: error },
    );
  }

  if (!Array.isArray(response.sections)) {
    throw new Error(
      `DICE promoter "${slug}" answered without "sections" - the profile ` +
        `response may have changed`,
    );
  }

  const truncated = response.sections.filter((section) => section.load_more);
  if (truncated.length > 0) {
    throw new Error(
      `DICE promoter "${slug}" has more events than its profile lists at ` +
        `once (load_more on "${truncated.map(({ key }) => key).join('", "')}"), ` +
        `and paging through a profile isn't supported yet`,
    );
  }

  return getSummariesFromResponse(response);
};

const nameContainsFilmKeyword = (name) => {
  const normalized = basicNormalize(name);
  return (
    normalized.includes("film") ||
    normalized.includes("movie") ||
    normalized.includes("screening") ||
    normalized.includes("soundtrack")
  );
};

async function collectEvents(transport) {
  const filmSummaries = await fetchSummaries(transport, "culture:film");

  // Every other tag is filtered down to a handful of events, so the film tag is
  // the only one whose emptiness is meaningful: London always has film events
  // on DICE, and an empty result means the search has stopped answering in the
  // shape we read rather than that there is nothing on.
  if (filmSummaries.length === 0) {
    throw new Error(
      'No events found under the "culture:film" tag — the DICE search response may have changed',
    );
  }

  const theatreSummaries = await fetchSummaries(transport, "culture:theatre");
  const filteredTheatreSummaries = theatreSummaries.filter((summary) =>
    nameContainsFilmKeyword(summary.name),
  );

  const gigSummaries = await fetchSummaries(transport, "music:gig");
  const filteredGigSummaries = gigSummaries.filter((summary) =>
    nameContainsFilmKeyword(summary.name),
  );

  const promoterSummaries = [];
  for (const slug of PROMOTERS) {
    promoterSummaries.push(...(await fetchPromoterSummaries(transport, slug)));
  }

  const summaries = [
    ...filmSummaries,
    ...filteredTheatreSummaries,
    ...filteredGigSummaries,
    ...promoterSummaries,
  ];

  // An event can be listed under more than one tag, and it is the same event
  // each time, so de-duplicate before spending a request on each one.
  const eventIds = [...new Set(summaries.map(({ id }) => id))];

  const events = [];
  for (const id of eventIds) {
    events.push(await transport.event(id));
  }

  return { events };
}

// The whole retrieve again, through a browser. Restarting rather than resuming:
// a 403 has only ever arrived on the first search, and the paging cursors and
// per-tag filtering are cheap next to the browser launch that precedes them.
const collectEventsWithBrowser = () =>
  withCamoufoxSession((getPage) =>
    getPage(SITE_URL, "dice-fm-events", async (page, response) => {
      if (isBotChallengeResponse(response)) {
        console.log(
          "      - Challenge served; waiting for Camoufox to solve it",
        );
      }
      await settleOnSite(page);
      return collectEvents(overBrowser(page));
    }),
  );

async function retrieve() {
  try {
    return await collectEvents(overFetch);
  } catch (error) {
    // Escalate on any 403, not just a labelled challenge. Cloudflare only sets
    // `cf-mitigated: challenge` when it offers a puzzle; when it refuses at the
    // origin instead the refusal is a bare status with an empty body, and the
    // two are indistinguishable from here (measured 2026-09-18: the same request
    // drew both, minutes apart, depending only on how the client was scored). A
    // browser launch on a run that is already failing is the cheaper mistake,
    // and the browser path reports which of the two it met.
    if (error.status !== 403) throw error;

    console.log(
      "    - Refused with a 403; retrying through Camoufox, which carries a browser fingerprint and can solve a challenge",
    );
    return await collectEventsWithBrowser();
  }
}

module.exports = retrieve;
