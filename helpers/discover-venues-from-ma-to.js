/**
 * Discover London film venues that ma.to lists and we don't cover yet.
 *
 * ma.to is an Instagram scraper with an LLM summariser sitting on top - every
 * event carries the `shortcode` of the post it came from, and its description
 * is a model's paraphrase of the caption. That rules it out as a source: it
 * publishes no booking URL, collapses a day's screenings into one start time,
 * and its titles are event blurbs rather than film titles. None of that data
 * belongs in the pipeline.
 *
 * What it is good for is knowing a venue exists. A gallery or theatre that
 * only announces a screening on Instagram is invisible to us until someone
 * notices it, and ma.to has already done the noticing. So this reads the
 * listing, matches each venue against the cinemas we hold, and prints the ones
 * left over as leads - venues to go and look at, then build a proper cinema
 * module against the venue's own site where real showtimes and booking URLs
 * live.
 *
 * Because a listing's venue is an Instagram account, the account that posted
 * an event and the place it happens can differ - Whitechapel Gallery posting a
 * screening held at Greatorex Street, 200m away. Where the posting account is
 * one of our cinemas that's reported too: it usually means a partnership or an
 * off-site programme rather than a venue we're missing.
 *
 * Usage:
 *   node helpers/discover-venues-from-ma-to.js
 *   node helpers/discover-venues-from-ma-to.js --json
 *   node helpers/discover-venues-from-ma-to.js --all
 */

const { fetchText, sleep, withJitter } = require("../common/utils");
const normalizeVenueName = require("../common/normalize-venue-name");
const {
  findMatchingCinema,
  sortVenuesByEventCount,
} = require("../common/source-utils");
const { getAllCinemaAttributes } = require("../cinemas");

const ORIGIN = "https://ma.to";
const LISTING_URL = `${ORIGIN}/events/london/anytime/film`;

// Node's fetch announces itself as "User-Agent: node", which ma.to refuses
// with a 403. Sending a browser's user agent keeps us on the same footing as
// any other reader of a public listing.
const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:151.0) Gecko/20100101 Firefox/151.0",
};

const REQUEST_DELAY_MS = 1_000;

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

/**
 * Decode the React flight payload the listing page ships its data in. Each
 * chunk is a JavaScript string literal, so `JSON.parse` unescapes it exactly
 * the way the browser does - including the `\uXXXX` that carry accented venue
 * names.
 * @param {string} html - The listing page HTML
 * @returns {string} The concatenated, unescaped payload
 */
function readFlightPayload(html) {
  const chunks = [
    ...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g),
  ].map(([, chunk]) => JSON.parse(`"${chunk}"`));

  if (chunks.length === 0) {
    throw new Error(
      `No flight payload found on ${LISTING_URL} - the page structure may have changed`,
    );
  }

  return chunks.join("");
}

/**
 * Read the query the listing page ran to build itself. Its city, category and
 * date range are opaque UUIDs and epochs, so they're taken from the page
 * rather than guessed at, and handed straight back when asking for more pages.
 * @param {string} payload - The decoded flight payload
 * @returns {Object} The query object
 */
function extractQuery(payload) {
  // The query holds only scalars, so it can be lifted without brace matching
  const match = payload.match(/"query":(\{[^{}]*\})/);
  if (!match) {
    throw new Error(
      `No query found in the ${LISTING_URL} payload - the page structure may have changed`,
    );
  }
  return JSON.parse(match[1]);
}

/**
 * Find the server action that pages through the listing. Its id changes with
 * every ma.to deploy, so it's read out of the JavaScript the page loads rather
 * than pinned here, where it would silently rot.
 * @param {string} html - The listing page HTML
 * @returns {Promise<string>} The `loadMoreEvents` action id
 */
async function findLoadMoreActionId(html) {
  const chunkUrls = [
    ...new Set(
      [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map(
        ([, src]) => `${ORIGIN}${src}`,
      ),
    ),
  ];

  for (const chunkUrl of chunkUrls) {
    const chunk = await fetchText(chunkUrl, { headers: REQUEST_HEADERS });
    const match = chunk.match(
      /createServerReference\)\("([0-9a-f]+)"[^)]*"loadMoreEvents"\)/,
    );
    if (match) return match[1];
  }

  throw new Error(
    `No loadMoreEvents server action found in the ${chunkUrls.length} chunks ${LISTING_URL} loads - the site may have changed how it pages`,
  );
}

/**
 * Ask for one page of events through the server action the listing itself uses
 * @param {string} actionId - The `loadMoreEvents` action id
 * @param {Object} query - The query read off the listing page
 * @param {number} page - Page number to request
 * @returns {Promise<Object>} `{ events, pagination }`
 */
async function fetchEventsPage(actionId, query, page) {
  const response = await fetchText(LISTING_URL, {
    method: "POST",
    headers: {
      ...REQUEST_HEADERS,
      "Next-Action": actionId,
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: JSON.stringify([{ ...query, page }]),
  });

  // The action replies in the flight format: one `<id>:<json>` per line
  for (const line of response.split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    let parsed;
    try {
      parsed = JSON.parse(line.slice(separator + 1));
    } catch {
      continue;
    }
    if (parsed && Array.isArray(parsed.events)) return parsed;
  }

  throw new Error(
    `No events in the loadMoreEvents response for page ${page} - the response shape may have changed`,
  );
}

/**
 * Pull every page of the London film listing
 * @returns {Promise<Array>} Every event ma.to lists
 */
async function retrieveEvents() {
  const listingPage = await fetchText(LISTING_URL, {
    headers: REQUEST_HEADERS,
  });
  const query = extractQuery(readFlightPayload(listingPage));
  const actionId = await findLoadMoreActionId(listingPage);

  const events = [];
  let page = 1;
  let totalPages = 1;

  do {
    const { events: pageEvents, pagination } = await fetchEventsPage(
      actionId,
      query,
      page,
    );
    events.push(...pageEvents);
    totalPages = pagination.totalPages;
    // Progress is diagnostic, so it goes to stderr - that keeps stdout clean
    // enough for `--json` to be piped straight into something else
    console.error(
      `${colors.gray} - page ${page}/${totalPages} (${events.length}/${pagination.total} events)${colors.reset}`,
    );
    page += 1;
    if (page <= totalPages) await sleep(withJitter(REQUEST_DELAY_MS));
  } while (page <= totalPages);

  return events;
}

/**
 * Group events by the place they happen. ma.to's venue record is the Instagram
 * account, and `venueName` overrides it per event when a post names somewhere
 * else - so the name is what identifies a place, and the accounts that posted
 * about it are collected alongside.
 * @param {Array} events - Every event retrieved
 * @returns {Array} One entry per venue
 */
function groupByVenue(events) {
  const venues = new Map();

  for (const event of events) {
    const name = event.venueName || event.venueLocation;
    if (!name) {
      throw new Error(
        `Event ${event.slug} has neither venueName nor venueLocation - the event shape may have changed`,
      );
    }

    const key = normalizeVenueName(name);
    if (!venues.has(key)) {
      venues.set(key, {
        name,
        venueLocation: event.venueLocation,
        address: event.venueAddress || "",
        postedBy: new Set(),
        events: [],
      });
    }

    const venue = venues.get(key);
    // A venue's address is filled in on some posts and blank on others
    if (!venue.address && event.venueAddress)
      venue.address = event.venueAddress;
    if (event.venueUsername) venue.postedBy.add(event.venueUsername);
    if (event.username) venue.postedBy.add(event.username);
    venue.events.push(event);
  }

  return [...venues.values()].map((venue) => ({
    ...venue,
    postedBy: [...venue.postedBy],
  }));
}

/**
 * Match a venue against the cinemas we hold. ma.to gives no coordinates, and
 * its addresses are partial often enough that a postcode check would reject
 * genuine matches - so this is a name match, deliberately. A lead we already
 * cover costs a glance; a venue hidden behind a bad postcode costs the find.
 * @param {Array} knownCinemas - Every cinema's attributes
 * @param {Object} venue - A grouped venue
 * @returns {Object|undefined} The cinema this venue is, if we hold it
 */
function matchVenue(knownCinemas, venue) {
  // `venueLocation` is deliberately not a candidate. It holds the name of the
  // Instagram account that posted, not the place - so matching on it marks
  // Greatorex Street, Toynbee Hall and OITIJ-JO Art Space as "covered" on the
  // strength of Whitechapel Gallery having posted about all three, hiding
  // exactly the venues this is meant to surface. That an account we hold
  // posted the event is worth knowing, and `matchPostingAccounts` reports it
  // precisely, off the handle rather than off a display name.
  //
  // A chain's branch is often split across name and address though - ma.to
  // naming the venue "Rooftop Cinema Club" and leaving "Stratford" in the
  // address, where we hold it as "Rooftop Cinema Club Stratford" - so the two
  // joined is tried as a name in its own right. A full street address never
  // matches a cinema name, so it costs nothing where the split doesn't apply.
  const candidates = [
    venue.name,
    venue.address && `${venue.name} ${venue.address}`,
  ].filter(Boolean);

  return candidates
    .map((name) => findMatchingCinema(knownCinemas, name, null))
    .find(Boolean);
}

/**
 * Match the Instagram accounts that posted about a venue against the cinemas
 * we hold, so an off-site screening run by a venue we already cover is
 * recognisable as one
 * @param {Array} knownCinemas - Every cinema's attributes
 * @param {Array} postedBy - Instagram handles that posted about the venue
 * @returns {Array} The cinemas those handles belong to
 */
function matchPostingAccounts(knownCinemas, postedBy) {
  return postedBy
    .map((handle) =>
      knownCinemas.find(
        (cinema) =>
          cinema.socials?.instagram &&
          cinema.socials.instagram.toLowerCase() === handle.toLowerCase(),
      ),
    )
    .filter(Boolean);
}

const formatEvent = (event) =>
  `${colors.gray}${(event.dates || "date unknown").padEnd(16)} ${colors.reset}${event.title}\n` +
  `${colors.gray}${" ".repeat(16)} ${ORIGIN}/event/${event.slug}${colors.reset}`;

function reportVenue(venue, index) {
  const count = venue.events.length;
  console.log(
    `${colors.bright}${colors.cyan}${index + 1}. ${venue.name}${colors.reset} ` +
      `${colors.dim}(${count} event${count === 1 ? "" : "s"})${colors.reset}`,
  );

  if (venue.address) {
    console.log(`   ${colors.gray}address:${colors.reset} ${venue.address}`);
  }

  for (const handle of venue.postedBy) {
    console.log(
      `   ${colors.gray}posted by:${colors.reset} ${ORIGIN}/venue/${handle} ${colors.gray}(instagram.com/${handle})${colors.reset}`,
    );
  }

  for (const cinema of venue.postingCinemas) {
    console.log(
      `   ${colors.yellow}↳ posted by a cinema we hold: ${cinema.name} (${cinema.id})${colors.reset}`,
    );
  }

  console.log(`   ${colors.gray}events:${colors.reset}`);
  for (const event of venue.events.slice(0, 3)) {
    console.log(
      formatEvent(event)
        .split("\n")
        .map((line) => `     ${line}`)
        .join("\n"),
    );
  }
  if (count > 3) {
    console.log(`     ${colors.gray}... and ${count - 3} more${colors.reset}`);
  }
  console.log("");
}

(async function () {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const showAll = args.includes("--all");

  console.error(`\n${colors.bright}🔍 Reading ${LISTING_URL}${colors.reset}\n`);

  const events = await retrieveEvents();
  const knownCinemas = getAllCinemaAttributes();

  const venues = sortVenuesByEventCount(
    groupByVenue(events).map((venue) => ({
      ...venue,
      matchingCinema: matchVenue(knownCinemas, venue),
      postingCinemas: matchPostingAccounts(knownCinemas, venue.postedBy),
    })),
  );

  const covered = venues.filter(({ matchingCinema }) => matchingCinema);
  const uncovered = venues.filter(({ matchingCinema }) => !matchingCinema);

  if (asJson) {
    console.log(JSON.stringify(showAll ? venues : uncovered, null, 2));
    return;
  }

  console.log(
    `\n${colors.bright}📊 ${events.length} film events across ${venues.length} venues${colors.reset}\n` +
      `   ${colors.green}${covered.length} already covered${colors.reset}\n` +
      `   ${colors.magenta}${uncovered.length} to investigate${colors.reset}\n`,
  );

  if (showAll) {
    console.log(`${colors.bright}Already covered${colors.reset}\n`);
    for (const venue of covered) {
      console.log(
        `   ${colors.green}✓${colors.reset} ${venue.name} ${colors.gray}→ ${venue.matchingCinema.id} (${venue.events.length})${colors.reset}`,
      );
    }
    console.log("");
  }

  console.log(`${colors.bright}Venues to investigate${colors.reset}\n`);
  uncovered.forEach(reportVenue);

  console.log(
    `${colors.dim}Leads only. ma.to's times, titles and prices are LLM summaries of Instagram\n` +
      `posts - build any venue worth having against its own site, not against these.${colors.reset}\n`,
  );
})();
