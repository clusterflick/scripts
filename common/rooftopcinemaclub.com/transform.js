const cheerio = require("cheerio");
const {
  getText,
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
  generateShowingId,
} = require("../utils");
const { isNotSportShowing } = require("../is-sport-showing");
const {
  getFilmSlug,
  findScreeningDateText,
  parseScreeningDate,
} = require("./utils");

function parseDurationToMins(value) {
  // Structured data durations are ISO 8601, e.g. "PT148M"
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(value || "");
  if (!match || (!match[1] && !match[2])) {
    throw new Error(`Unable to parse film duration: "${value}"`);
  }

  return parseInt(match[1] || 0, 10) * 60 + parseInt(match[2] || 0, 10);
}

function getFilmDetails(html, filmSlug) {
  if (!html) {
    throw new Error(`Missing screening page for film "${filmSlug}"`);
  }

  const $ = cheerio.load(html);
  const structuredData = $('script[type="application/ld+json"]')
    .map((i, el) => JSON.parse(getText($(el))))
    .get();
  const film = structuredData.find(
    ({ "@type": type }) => type === "ScreeningEvent",
  )?.workFeatured;

  if (!film) {
    throw new Error(
      `Missing structured data for film "${filmSlug}" — page structure may have changed`,
    );
  }

  // Not every listing is a film with a release year — TV shows and multi-film
  // events don't have one
  return {
    duration: parseDurationToMins(film.duration),
    year: film.dateCreated,
  };
}

async function transform(
  attributes,
  { screeningPages, soldOutDetails, filmPages },
  sourcedEvents,
) {
  const { domain, url } = attributes;
  const listingUrl = `${url}/screenings#:~:text=`;
  const moviesBySlug = {};

  for (const html of screeningPages) {
    const $ = cheerio.load(html);

    $(".screening-card").each((i, el) => {
      const $card = $(el);

      const $link = $card.find("h3 a");
      const title = getText($link);
      const href = $link.attr("href");

      if (!title || !href) {
        throw new Error(
          "Screening card missing title or href — page structure may have changed",
        );
      }

      const url = `${domain}${href}`;
      const filmSlug = getFilmSlug(href);

      const dateText = findScreeningDateText($, $card);

      let timeText;
      $card.find("[data-checkout-screening] span").each((j, span) => {
        const text = getText($(span));
        if (/^\d+:\d+ [AP]M$/.test(text)) {
          timeText = text;
          return false;
        }
      });

      const $waitlist = $card.find("[data-waitlist-screening]");
      const isSoldOut = $waitlist.length > 0;

      let date;
      if (timeText) {
        if (!dateText) {
          throw new Error(
            `Missing date for screening "${title}" — page structure may have changed`,
          );
        }
        date = parseScreeningDate(dateText, timeText);
      } else if (isSoldOut) {
        const uuid = $waitlist.attr("data-waitlist-screening");
        const details = soldOutDetails[uuid];
        if (!details || !details.time) {
          throw new Error(
            `Missing time details for sold-out screening "${title}" (${uuid})`,
          );
        }
        if (!dateText) {
          throw new Error(
            `Missing date for sold-out screening "${title}" — page structure may have changed`,
          );
        }
        date = parseScreeningDate(dateText, details.time);
      } else {
        throw new Error(
          `Missing time for screening "${title}" — page structure may have changed`,
        );
      }

      const overviewText = getText($card.find("p").first());

      const notesList = [];
      $card.find(".space-y-1 [style*='background-color']").each((j, t) => {
        const tag = getText($(t));
        if (tag) notesList.push(tag);
      });

      const accessibility = createAccessibility(title, {}, overviewText);
      const format = createFormat(title, {}, overviewText);
      const performance = createPerformance({
        date,
        notesList,
        url,
        status: isSoldOut ? { soldOut: true } : {},
        accessibility,
        format,
      });

      if (!moviesBySlug[filmSlug]) {
        moviesBySlug[filmSlug] = {
          showingId: generateShowingId(attributes, filmSlug),
          title,
          url: `${listingUrl}${encodeURIComponent(title)}`,
          overview: createOverview(
            getFilmDetails(filmPages[filmSlug], filmSlug),
          ),
          performances: [],
          matchingHints: { overview: overviewText },
        };
      }

      moviesBySlug[filmSlug].performances.push(performance);
    });
  }

  const movies = Object.values(moviesBySlug).filter(isNotSportShowing);

  // We can't have the usual check for no movies as this venue is seasonal
  // and only has showings in the Summer

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
