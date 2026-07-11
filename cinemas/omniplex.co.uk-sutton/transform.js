const cheerio = require("cheerio");
const { parse, set } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  getText,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  generateShowingId,
} = require("../../common/utils");
const attributes = require("./attributes");

function extractDurationInMinutes(text) {
  if (!text) return undefined;
  const hoursMatch = text.match(/(\d+)\s*hr/i);
  const minutesMatch = text.match(/(\d+)\s*min/i);
  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
  const total = hours * 60 + minutes;
  return total || undefined;
}

function extractClassification(imgSrc) {
  const m = imgSrc?.match(/UK_([^.]+)\.png/);
  return m ? m[1] : undefined;
}

// Walk up from the favourite-button img until we find an ancestor that owns
// .showTimeBox descendants. The img is in the info column; showtimes are in a
// sibling column — their first common ancestor is the movie-level inner grid.
function findMovieCard($anchor) {
  let $el = $anchor.parent();
  for (let depth = 0; depth < 10; depth++) {
    if (!$el.length) return null;
    if ($el.find(".showTimeBox").length > 0) return $el;
    $el = $el.parent();
  }
  return null;
}

function parseMovieCard($card, $, dateStr) {
  const eventId = $card
    .find('img[id^="favourite"]')
    .attr("id")
    ?.replace("favourite", "");
  if (!eventId) return null;

  const $titleLink = $card.find("p.font-medium a").first();
  const title = getText($titleLink);
  const moviePath = $titleLink.attr("href");
  if (!title || !moviePath) return null;
  const url = moviePath.startsWith("http")
    ? moviePath
    : `${attributes.domain}${moviePath}`;

  const ratingImgSrc =
    $card.find('img[src*="ratings/UK_"]').first().attr("src") || "";
  const classification = extractClassification(ratingImgSrc);
  const genre = getText(
    $card.find('img[src*="ratings/UK_"]').first().siblings("p").first(),
  );

  const durationText = getText(
    $card
      .find("p")
      .filter((i, el) => /\d+\s*(hr|min)/i.test($(el).text()))
      .first(),
  );
  const duration = extractDurationInMinutes(durationText);

  const synopsis =
    getText($card.find(".synopsis-full").first()) ||
    getText($card.find(".synopsis-short").first());

  const baseDate = parse(dateStr, "yyyy-MM-dd", new Date(), { locale: enGB });
  const performances = [];

  $card.find(".showTimeBox").each((i, perfEl) => {
    const $box = $(perfEl);
    const bookingUrl = $box.parent("a").attr("href");

    const timeText = getText($box.find(".bigText").first());
    const timeMatch = timeText.match(/^(\d{1,2}):(\d{2})/);
    if (!timeMatch) return;

    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const performanceDate = set(baseDate, { hours, minutes, seconds: 0 });

    const screen = getText($box.find(".bottomSection p.smallText").first());

    performances.push(
      createPerformance({
        date: performanceDate,
        url: () => bookingUrl,
        screen,
        accessibility: createAccessibility(title, {}, synopsis),
        format: createFormat(title, {}, synopsis),
      }),
    );
  });

  return {
    eventId,
    title,
    url,
    classification,
    genre,
    duration,
    synopsis,
    performances,
  };
}

async function transform({ datePages }, sourcedEvents) {
  const movieMap = new Map();

  for (const [date, html] of Object.entries(datePages)) {
    const $ = cheerio.load(html);

    $('img[id^="favourite"]').each((i, el) => {
      const $movieCard = findMovieCard($(el));
      if (!$movieCard) return;

      const movie = parseMovieCard($movieCard, $, date);
      if (!movie) return;
      const {
        eventId,
        title,
        url,
        classification,
        genre,
        duration,
        synopsis,
        performances,
      } = movie;

      if (performances.length === 0) return;

      if (movieMap.has(url)) {
        movieMap.get(url).performances.push(...performances);
      } else {
        movieMap.set(url, {
          showingId: generateShowingId(attributes, eventId),
          title,
          url,
          overview: createOverview({
            duration,
            categories: genre,
            classification,
          }),
          performances,
          matchingHints: { overview: synopsis },
        });
      }
    });
  }

  const movies = Array.from(movieMap.values());
  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap((e) => e);
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
