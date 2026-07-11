const cheerio = require("cheerio");
const { parse, isBefore, startOfDay, addYears, subDays } = require("date-fns");
const {
  getText,
  createOverview,
  createPerformance,
  createAccessibility,
  createFormat,
  generateShowingId,
} = require("../utils");
const { isNotSportShowing } = require("../is-sport-showing");

function parseScreeningDate(dateText, timeText) {
  const dateOnly = parse(dateText, "EEE, MMM d", new Date());
  const parsedDate = parse(timeText, "h:mm a", dateOnly);

  if (isNaN(parsedDate.getTime())) {
    throw new Error(
      `Unable to parse screening date: "${dateText}" / "${timeText}"`,
    );
  }

  // If the date is more than 14 days in the past, it's likely a year-boundary
  // case (e.g. a December showing scraped in January) and we need to add a year.
  // Events within 14 days may just be recently passed events still listed on the page.
  const today = startOfDay(new Date());
  if (isBefore(parsedDate, subDays(today, 14))) return addYears(parsedDate, 1);

  return parsedDate;
}

async function transform(
  attributes,
  { screeningPages, soldOutDetails },
  sourcedEvents,
) {
  const { domain } = attributes;
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
      const slug = href.split("/").pop();
      const filmSlug = slug.replace(/-\d+$/, "");

      let dateText;
      $card.find("span").each((j, span) => {
        const text = getText($(span));
        if (/^\w+, \w+ \d+$/.test(text)) {
          dateText = text;
          return false;
        }
      });

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
          url,
          overview: createOverview({}),
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
