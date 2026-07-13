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

// japanesefilm.club is a UK-wide directory, but we only cover London venues.
// Some out-of-London cinemas share a name with a London venue — e.g.
// "Showroom, Sheffield" collides with "The Showroom" in London — and this
// source has no per-venue coordinates for the matcher to disambiguate with. As
// a stopgap, drop screenings whose location (the part after the venue name) is
// a city we don't cover, before they ever reach venue matching. The durable
// fix is to fetch each venue page and match on its address/postcode.
const EXCLUDED_LOCATIONS = ["Cardiff", "Oxford", "Sheffield"];

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

// A schedule date reads like "Saturday 12/09/2026 17:00pm". The time is already
// 24-hour, so the trailing am/pm is redundant noise we strip before parsing.
// Undated screenings are explicitly marked "Screening Date TBC" and return
// undefined so the caller can skip them. Anything else that fails to parse is a
// format change we want to surface loudly rather than silently drop.
function parseScheduleDate(text) {
  if (/\bTBC\b/i.test(text)) return undefined;

  const cleaned = text.replace(/(am|pm)\s*$/i, "").trim();
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

    const cinemaText = getText($item.find("a.cinema_title"));
    const [venueName, ...locationParts] = cinemaText
      .split(",")
      .map((part) => part.trim());
    if (!venueName) {
      throw new Error(
        `Unable to extract a venue name from a screening on ${url} — the schedule structure may have changed`,
      );
    }

    // Drop screenings at cities we don't cover before venue matching (see
    // EXCLUDED_LOCATIONS above).
    const location = locationParts.join(", ");
    if (
      EXCLUDED_LOCATIONS.some(
        (excluded) => excluded.toLowerCase() === location.toLowerCase(),
      )
    ) {
      return;
    }

    // A missing date means the screening is legitimately undated (TBC); skip it.
    const date = parseScheduleDate(getText($item.find("h6")));
    if (!date) return;

    const bookingUrl = $item.find(".seven_day_button a").attr("href") || url;

    performances.push({ venueName, date, bookingUrl, subtitled });
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

  const events = [];

  for (const [url, moviePage] of Object.entries(data.moviePages || {})) {
    const movie = parseMovie(cheerio, moviePage, url);

    const matchingPerformances = movie.performances.filter((performance) =>
      venueMatchesCinema(cinema, performance.venueName),
    );

    if (matchingPerformances.length === 0) continue;

    const slug = url.replace(/\/$/, "").split("/").pop();

    events.push({
      showingId: generateShowingId(attributes, slug),
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
