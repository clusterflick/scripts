const cheerio = require("cheerio");
const {
  getText,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  generateShowingId,
  removeAlreadyListedPerformances,
} = require("../../common/utils");
const normalizeTitle = require("../../common/normalize-title");
const ticketSourceAttributes = require("../../sources/ticketsource.co.uk/attributes");
const { parseDate } = require("./utils");

const infoMatcher = /^([^,]+),\s+(\d{4}),\s+(\d+)\s+min(\s+|$|,)/i;

// Every booking on this site is a TicketSource link, which identifies either the
// event (`e-`) or one performance within it (`t-`). Only the event hash
// identifies the film.
const BOOKING_HASH_PATTERN = /^([et])-[a-z0-9]+$/i;

// The site links bookings to ticketsource.com; everything stored - and every
// booking URL the TicketSource source produces - uses the .co.uk domain.
const toStoredBookingDomain = (url) =>
  url?.replace("://www.ticketsource.com/", "://www.ticketsource.co.uk/");

const parseDetailsFrom = (info) => {
  const match = info.match(infoMatcher);
  if (!match) return {};
  const [, directors, year, duration] = match;
  return { directors, year, duration };
};

const getBookingHash = (url) => {
  const hash = url?.split("/").pop();
  return BOOKING_HASH_PATTERN.test(hash ?? "") ? hash.toLowerCase() : undefined;
};

function parseMovie(url, moviePage) {
  const $ = cheerio.load(moviePage);
  const $movieListing = $("#film_program_support");
  // The listing separates its lines with `<br>`, which text extraction would
  // otherwise concatenate - running the credits line into whatever follows it
  // ("125 minNew 4K restoration") and hiding it from `infoMatcher`.
  $movieListing.find("br").replaceWith("\n");

  // The heading is "<date range>: <film title>", and a title may itself contain
  // a colon, so only the first piece is dropped.
  const titleText = getText($movieListing.find("h1").first());
  const [, ...titlePieces] = titleText.split(":");
  const title = titlePieces.join(":").trim();
  if (title === "") {
    throw new Error(
      `No film title in the heading "${titleText}" (${url}) - the page structure may have changed`,
    );
  }

  const $info = $movieListing.find("p:has(img:first-child:last-child)").next();
  $info.find("strong").remove(); // Remove title if it's present
  const info = getText($info);
  const description = getText($movieListing);

  const performances = [];
  const bookingHashes = new Set();
  $(".booking_calender #addform tr#row").each(function () {
    const $cells = $(this).find("td");
    const date = parseDate(
      `${getText($cells.eq(1))} @ ${getText($cells.eq(2))}`,
    );
    const rawBookingUrl = $cells.eq(3).find("a").attr("href");
    const hash = getBookingHash(rawBookingUrl);
    if (hash) bookingHashes.add(hash);
    performances.push(
      createPerformance({
        date,
        url: toStoredBookingDomain(rawBookingUrl) || url,
        accessibility: createAccessibility(title, {}, description),
        format: createFormat(title, {}, description),
      }),
    );
  });

  return {
    bookingHashes: [...bookingHashes],
    title,
    url,
    overview: createOverview(parseDetailsFrom(info)),
    performances,
    matchingHints: { overview: description },
  };
}

// A film is identified by its TicketSource event, so a showing keeps the same id
// whether it was built from the venue's site or from the TicketSource source
// alone. Films don't get re-flagged as new, and turning this venue back into a
// source-only one is a no-op.
function findSourcedEventFor(movie, ticketSourceEvents) {
  const performanceTimes = new Set(movie.performances.map(({ time }) => time));
  return ticketSourceEvents.find(
    (event) =>
      normalizeTitle(event.title) === normalizeTitle(movie.title) &&
      event.performances.some(({ time }) => performanceTimes.has(time)),
  );
}

// Every hash that can lead to a TicketSource event: the event's own `e-` hash
// and the `t-` hash of each of its performances. A film page links to one or the
// other, so this is what turns a booking link into the event behind it - and the
// only way to reach an event from a link that names a single performance.
function indexEventsByBookingHash(ticketSourceEvents) {
  const eventsByHash = new Map();
  for (const event of ticketSourceEvents) {
    for (const url of [
      event.url,
      ...event.performances.map((p) => p.bookingUrl),
    ]) {
      const hash = getBookingHash(url);
      if (hash) eventsByHash.set(hash, event);
    }
  }
  return eventsByHash;
}

// Resolution has two tiers. The first two steps ask TicketSource, which is
// authoritative because it is where today's ids already come from. The last two
// only run when TicketSource has no record of the film at all - an unlisted
// booking link, a truncated retrieve, or no TicketSource data in the working
// copy - and have to construct an id from what the page prints instead.
function resolveShowingId(movie, sourcedEvent, eventsByBookingHash) {
  // 1. TicketSource, matched on title and time.
  if (sourcedEvent) return sourcedEvent.showingId;

  // 2. TicketSource, asked what the page's booking link points at. Reached when
  // the two disagree on a title or a showtime - they have disagreed on a
  // spelling before ("Nostalghia" / "Nostalgia") - and it is the only way to get
  // from a link naming a single performance to the event containing it.
  const linkedEvent = movie.bookingHashes
    .map((hash) => eventsByBookingHash.get(hash))
    .find(Boolean);
  if (linkedEvent) return linkedEvent.showingId;

  // 3. No TicketSource record, so take the page's word for it. An event hash is
  // exactly the id TicketSource will publish once it does list the event, so the
  // film's identity is right in advance and won't change.
  //
  // Asking TicketSource first also matters here: the site has linked a film to
  // the wrong event before - the case the old transform's `bookingCorrections`
  // list existed to patch - and steps 1 and 2 give the right answer whenever
  // TicketSource knows the film.
  const eventHashes = movie.bookingHashes.filter((hash) =>
    hash.startsWith("e-"),
  );
  if (eventHashes.length === 1) {
    return generateShowingId(ticketSourceAttributes, eventHashes[0]);
  }
  if (eventHashes.length > 1) {
    throw new Error(
      `"${movie.title}" (${movie.url}) links to ${eventHashes.length} TicketSource events (${eventHashes.join(", ")}) - unable to identify it`,
    );
  }

  // 4. No TicketSource record and only a performance link, so unlike step 3 this
  // is not the id TicketSource will publish - that would be the `e-` of the
  // event containing this performance, which only TicketSource can name. It
  // identifies the screening uniquely, so it's used rather than failing the run,
  // and the film changes id once when TicketSource data comes back.
  const performanceHashes = movie.bookingHashes.filter((hash) =>
    hash.startsWith("t-"),
  );
  if (performanceHashes.length === 1) {
    console.log(
      `      - ⚠️  "${movie.title}" has no TicketSource event, only performance ${performanceHashes[0]} - using a temporary id`,
    );
    return generateShowingId(ticketSourceAttributes, performanceHashes[0]);
  }

  throw new Error(
    `Unable to identify "${movie.title}" (${movie.url}) - it has no TicketSource event or booking link`,
  );
}

async function transform({ moviePages }, sourcedEvents) {
  const ticketSourceEvents = sourcedEvents[ticketSourceAttributes.id] ?? [];
  const eventsByBookingHash = indexEventsByBookingHash(ticketSourceEvents);

  const movies = [];
  for (const [url, moviePage] of Object.entries(moviePages)) {
    const { bookingHashes, ...movie } = parseMovie(url, moviePage);

    // A programme page announced before its dates are bookable has nothing to
    // publish and nothing to identify it with. It's dropped later anyway for
    // having no performances, so skip it here rather than fail the run over a
    // film that wouldn't have appeared.
    if (movie.performances.length === 0) {
      console.log(`      - Skipping "${movie.title}" - no dates listed yet`);
      continue;
    }

    const sourcedEvent = findSourcedEventFor(movie, ticketSourceEvents);
    movies.push({
      ...movie,
      showingId: resolveShowingId(
        { ...movie, bookingHashes },
        sourcedEvent,
        eventsByBookingHash,
      ),
    });
  }

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const moviesByShowingId = new Map(
    movies.map((movie) => [movie.showingId, movie]),
  );
  const unlistedEvents = [];

  for (const event of Object.values(sourcedEvents).flatMap((e) => e)) {
    // A sourced event the site also lists shares its showing id, so it can't be
    // emitted alongside it - two movies with one id silently overwrite each
    // other when the release is combined. Merge in only what the venue's own
    // calendar didn't list (a screening added after the page was built, or one
    // the site has already stopped advertising) rather than dropping it.
    //
    // Matching on time rather than booking URL is deliberate: the site links
    // every row of a film to the same event-level URL, while TicketSource links
    // each performance to its own, so a URL comparison would either merge
    // nothing or drop everything.
    const movie = moviesByShowingId.get(event.showingId);
    if (!movie) {
      unlistedEvents.push(event);
      continue;
    }
    const listedTimes = new Set(movie.performances.map(({ time }) => time));
    movie.performances = movie.performances.concat(
      event.performances.filter(({ time }) => !listedTimes.has(time)),
    );
  }

  // Events with no film page of their own are venue hire - the site never lists
  // them, so TicketSource is the only place they appear. Their performances are
  // still checked against the venue's, in case another source has covered a
  // screening the site does list under a different title.
  const transformed = movies.concat(
    removeAlreadyListedPerformances(movies, unlistedEvents).filter(
      ({ performances }) => performances.length > 0,
    ),
  );

  // Nothing downstream enforces this: `combine` keys showings by id and would
  // let one silently overwrite the other, so a collision has to fail here.
  const showingIds = transformed.map(({ showingId }) => showingId);
  const duplicates = showingIds.filter(
    (showingId, index) => showingIds.indexOf(showingId) !== index,
  );
  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate showing ids: ${[...new Set(duplicates)].join(", ")}`,
    );
  }

  return transformed;
}

module.exports = transform;
