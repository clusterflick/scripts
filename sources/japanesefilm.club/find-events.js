const path = require("node:path");
const cheerio = require("cheerio");
const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale");
const {
  createPerformance,
  createOverview,
  generateShowingId,
  readJSON,
  createAccessibility,
  createFormat,
  getText,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const attributes = require("./attributes");

// ".director_country_release" reads like "Suo Masayuki、Japan、1996", using a
// fullwidth comma as the separator.
function parseDirectorCountryRelease(text) {
  const parts = text
    .split("、")
    .map((part) => part.trim())
    .filter(Boolean);

  const year = parts.find((part) => /^\d{4}$/.test(part));
  const directors = parts[0] && parts[0] !== year ? parts[0] : undefined;

  return { directors, year };
}

// ".run_time" reads like "137mins".
function parseDuration(text) {
  const duration = parseInt(text, 10);
  return Number.isNaN(duration) ? undefined : duration;
}

// A schedule date reads like "Saturday 19/09/2026 - 18:00", and previously like
// "Saturday 12/09/2026 17:00pm". The time is already 24-hour, so the trailing
// am/pm is redundant noise, and the separator between date and time is
// optional; both are stripped before parsing. Undated screenings are explicitly
// marked "Screening Date TBC" and return undefined so the caller can skip them.
// Anything else that fails to parse is a format change we want to surface
// loudly rather than silently drop.
function parseScheduleDate(text) {
  if (/\bTBC\b/i.test(text)) return undefined;

  const cleaned = text
    .replace(/(am|pm)\s*$/i, "")
    .replace(/\s+-\s+/, " ")
    .trim();
  const date = parse(cleaned, "EEEE dd/MM/yyyy HH:mm", new Date(), {
    locale: enGB,
  });
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      `Unable to parse screening date "${text}" — the date format may have changed`,
    );
  }
  return date;
}

function parseMovie($, moviePage, url) {
  const $page = $.load(moviePage);

  const title = getText($page(".title h1"));
  if (!title) {
    throw new Error(
      `Unable to extract a film title from ${url} — the page structure may have changed`,
    );
  }

  const description = getText($page(".content p").first());
  const duration = parseDuration(getText($page(".run_time").first()));
  const { directors, year } = parseDirectorCountryRelease(
    getText($page(".director_country_release").first()),
  );
  const subtitled = getText($page(".subs_language").first())
    .toLowerCase()
    .includes("sub");
  // Format is unlikely to be advertised, but the meta strip is the best place
  // to find it if it ever is.
  const metaText = $page(".meta_bit")
    .map((i, el) => getText($page(el)))
    .get()
    .join(" ");

  const performances = [];
  $page(".item.screening_schedule").each((i, item) => {
    const $item = $page(item);

    const $cinema = $item.find("a.cinema_title");
    const venueName = getText($cinema).split(",")[0].trim();
    if (!venueName) {
      throw new Error(
        `Unable to extract a venue name from a screening on ${url} — the schedule structure may have changed`,
      );
    }

    // The venue page linked here carries the address (with postcode) we use to
    // match the screening to a known cinema; keep the URL so find-events can
    // look it up in the retrieved venuePages.
    const venueHref = $cinema.attr("href");
    const venueUrl = venueHref
      ? new URL(venueHref, attributes.domain).href
      : undefined;

    // A missing date means the screening is legitimately undated (TBC); skip it.
    const date = parseScheduleDate(getText($item.find("h6")));
    if (!date) return;

    const bookingUrl = $item.find(".seven_day_button a").attr("href") || url;

    performances.push({ venueName, venueUrl, date, bookingUrl, subtitled });
  });

  return {
    url,
    title,
    description,
    duration,
    directors,
    year,
    metaText,
    performances,
  };
}

// A venue page's ".venue_event" reads like
// "15 Paternoster Row, Sheffield, S1 2BX - view map ›". We keep the address and
// drop the trailing "- view map" link text. Some venues have no address here,
// in which case we return an empty string and matching falls back to name only.
function parseVenueAddress($, venuePage) {
  const $page = $.load(venuePage);
  return getText($page(".venue_event").first())
    .replace(/-\s*view map.*$/i, "")
    .trim();
}

async function findEvents(cinema) {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "japanesefilm.club",
  );

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  const venuePages = data.venuePages || {};
  const events = [];

  for (const [url, moviePage] of Object.entries(data.moviePages || {})) {
    const movie = parseMovie(cheerio, moviePage, url);

    const matchingPerformances = movie.performances.filter((performance) => {
      const venuePage =
        performance.venueUrl && venuePages[performance.venueUrl];
      const eventAddress = venuePage
        ? parseVenueAddress(cheerio, venuePage)
        : undefined;
      return venueMatchesCinema(cinema, performance.venueName, null, {
        eventAddress,
      });
    });

    if (matchingPerformances.length === 0) continue;

    // One film page covers a tour, listing the same film at several venues, so
    // the slug alone is not unique: Shall We Dance? played the Phoenix and
    // Regent Street, and both venues were handed the same showing id. `combine`
    // keys showings by id, so the later venue overwrote the earlier one and
    // carried off its performances. The cinema is what separates them, and
    // without its id the collision would come straight back.
    if (!cinema.id) {
      throw new Error(
        `Cannot build a showing id for ${url}: the cinema has no id`,
      );
    }
    const slug = url.replace(/\/$/, "").split("/").pop();

    events.push({
      showingId: generateShowingId(attributes, `${slug}-${cinema.id}`),
      title: movie.title,
      url: movie.url,
      overview: createOverview({
        duration: movie.duration,
        year: movie.year,
        directors: movie.directors,
      }),
      performances: matchingPerformances.map((performance) =>
        createPerformance({
          date: performance.date,
          url: performance.bookingUrl,
          notesList: [`Presented by ${attributes.name}`],
          accessibility: createAccessibility(
            movie.title,
            { subtitled: performance.subtitled },
            movie.description,
          ),
          format: createFormat(movie.title, {}, movie.metaText),
        }),
      ),
      matchingHints: { overview: movie.description },
    });
  }

  return events;
}

module.exports = findEvents;
