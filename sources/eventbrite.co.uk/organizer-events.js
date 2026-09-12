const { fetchJson, sleep, withJitter } = require("../../common/utils.js");
const { dailyCache } = require("../../common/cache.js");

// The search is a ranked window rather than an enumeration - it reports an
// `object_count` of 10000 but caps `page_count` at 49, so 980 rows is all it
// will ever hand over, and which 980 is decided by relevance rather than date.
// An organiser running a weekly strand can therefore have most of it fall off
// the end: on the 2026-09-10 retrieve, Courthouse Hotel Soho's sixteen "Cinema
// Club" screenings were represented by three. Asking the organiser directly is
// the way back to the rest, and follows what feverup's retrieve does when its
// own catalogue truncates.
//
// Eventbrite's organiser profile is client-rendered, but the endpoints its page
// calls answer a plain request - a browser is needed to find them, not to read
// them. There are two because the profile pages its own list differently after
// the first: page one is anchored to a date, later pages are plain offsets, and
// they disagree about the spelling of the more-results flag. The older
// `/org/<id>/showmore/` endpoint is WAF-blocked (403) and the profile URL
// ignores `?page=`, so this pair is the only route to a full list.
const API_BASE =
  "https://www.eventbrite.co.uk/organizer-profile/api/organizers";

// The page size the profile itself asks for.
const PAGE_SIZE = 12;

// How many events there are to collect is not a guess: the offset endpoint
// reports a `total`, and that is what bounds the paging. This is only a runaway
// guard for the case where it stops doing so - loudly, because a silent stop
// here would look exactly like the truncation this whole module exists to undo.
//
// It has to be generous, because an organiser's size has nothing to do with how
// many of their events we want. Organiser 15241684138 reports 697, of which 451
// are at Waterstones and 11 at a venue we hold - they are a national bookshop
// events account that happens to run a Conway Hall strand. Paging them in full
// is the price of those 11.
const MAX_PAGES = 500;

const ORGANIZER_RETRY_CONFIG = { retries: 3, delayMs: 5_000, backoffFactor: 2 };
const ORGANIZER_REQUEST_DELAY_MS = 2_000;

const getPageUrl = (organizerId, page, fromDate) =>
  page === 1
    ? `${API_BASE}/${organizerId}/events-from-date/?from_date=${fromDate}&page=1&page_size=${PAGE_SIZE}&order_by=start_asc`
    : `${API_BASE}/${organizerId}/events/?page=${page}&pageSize=${PAGE_SIZE}`;

/**
 * Every event an organiser has on from `fromDate`, in their own listing shape.
 */
async function fetchOrganizerEvents(organizerId, fromDate) {
  const events = [];
  let page = 1;
  let reportedTotal = null;

  while (page <= MAX_PAGES) {
    const data = await dailyCache(
      `eventbrite-organizer-${organizerId}-${page}`,
      async () => {
        await sleep(withJitter(ORGANIZER_REQUEST_DELAY_MS));
        return fetchJson(
          getPageUrl(organizerId, page, fromDate),
          undefined,
          ORGANIZER_RETRY_CONFIG,
        );
      },
    );

    events.push(...(data.events || []));

    // Only the offset endpoint carries a total, so it arrives from the second
    // page on. The two endpoints share one offset space - paging them in
    // sequence returns no event twice - so it counts what page one returned too.
    if (typeof data.total === "number") reportedTotal = data.total;

    // `has_more` on the date-anchored first page, `hasMore` on the rest. Some
    // organisers keep reporting more once their total is exhausted, so the
    // total is trusted over the flag where the two disagree.
    const hasMore = data.has_more ?? data.hasMore;
    if (!hasMore) return events;
    if (reportedTotal !== null && events.length >= reportedTotal) return events;

    page += 1;
  }

  throw new Error(
    `Organiser ${organizerId} still reported more events after ${MAX_PAGES} pages ` +
      `(total reported: ${reportedTotal ?? "none"}), so their calendar would be incomplete`,
  );
}

// The search sweeps arrive pre-filtered: Eventbrite only returns events
// matching "screening" or sitting in its film category, and that filter was
// doing quiet work. An organiser's calendar has no equivalent - it is
// everything they run, which for Union Chapel is mostly concerts and for a
// library mostly children's activities. On the 2026-09-12 retrieve, 429 of 507
// recovered events were not films: food galas, business networking, life
// drawing, pilates. The existing non-film and sport checks only catch 22% of
// them, because they name specific event series rather than describing a
// category, which is how they should stay.
//
// The event's own taxonomy looks like the answer and is not. Six of Courthouse
// Soho's fourteen "Cinema Club" screenings carry a null category despite being
// one weekly strand, and real films sit under Arts - "Leytonstone Library Kids
// Film Club". Filtering on it would reintroduce the miss this module exists to
// fix. The title survives that inconsistency: stems rather than whole words so
// "Films" and "Screenings" match, plus a bracketed year, which is how a venue
// writes a repertory listing and the only thing that catches "The Phantom of
// the Opera (1925)".
//
// Deliberately aggressive. A comedy night or a book club at a cinema is dropped
// here: those categories exist for a venue's own listings, where the programme
// is the venue's own, but an event arriving from a source has to earn its place.
const FILM_SHAPED_TITLE =
  /\b(cinema|film|screening|movie|short film|documentar)|\((?:19|20)\d\d\)/i;

/**
 * Whether an organiser's event is worth pursuing as a film screening. Checked
 * on the listing, before the event page is requested - it is the difference
 * between 81 event pages and 507.
 */
const hasFilmShapedTitle = ({ name }) => FILM_SHAPED_TITLE.test(name || "");

// "2026-10-03T17:00:00" -> ["2026-10-03", "17:00"]
//
// Trimmed to the minute because that is the shape search results use, and
// parseDate matches it exactly - date-fns rejects the string outright rather
// than ignoring a trailing ":00", so an untrimmed time reaches createPerformance
// as an Invalid Date.
function splitLocalDateTime(local, field, url) {
  const [date, time] = (local || "").split("T");
  const [hours, minutes] = (time || "").split(":");
  if (!date || !hours || !minutes) {
    throw new Error(
      `Could not read a local ${field} from the event page at ${url} (got ${JSON.stringify(local)})`,
    );
  }
  return [date, `${hours}:${minutes}`];
}

// Every one of the 1459 events in the 2026-09-10 search retrieve carried
// exactly this URL for its own id, so it is the platform's checkout link rather
// than a per-event value we would be guessing at.
const buildTicketsUrl = (id) =>
  `https://www.eventbrite.com/checkout-external?eid=${id}`;

/**
 * Put an organiser's event into the shape the search results use.
 *
 * The organiser endpoint returns a thinner event than search does: `summary`
 * and `tickets_url` come back empty, and `end_time` is a copy of `start_time`,
 * which would have every one of these listings claim the film runs for no time
 * at all. All three are on the event's own page, which is fetched for these
 * events anyway, so they are filled from there rather than shipped empty.
 *
 * `tags` cannot be filled: Eventbrite attaches them to search results only, and
 * they are absent from the event page too. find-events documents what that
 * costs.
 */
function normalizeOrganizerEvent(event, details) {
  const basicInfo = details?.props?.pageProps?.context?.basicInfo;
  if (!basicInfo) {
    throw new Error(
      `No event details to complete the organiser listing for ${event.url}`,
    );
  }

  const [startDate, startTime] = splitLocalDateTime(
    basicInfo.startDate?.local,
    "start date",
    event.url,
  );
  const [endDate, endTime] = splitLocalDateTime(
    basicInfo.endDate?.local,
    "end date",
    event.url,
  );

  return {
    ...event,
    start_date: startDate,
    start_time: startTime,
    end_date: endDate,
    end_time: endTime,
    summary: basicInfo.summary || "",
    tickets_url: buildTicketsUrl(event.id),
  };
}

module.exports = {
  fetchOrganizerEvents,
  hasFilmShapedTitle,
  normalizeOrganizerEvent,
};
