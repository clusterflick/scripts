const cheerio = require("cheerio");
const { parse, set } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  getText,
  createPerformance,
  createOverview,
  createAccessibility,
  createOccasions,
  createFormat,
  generateShowingId,
} = require("../../common/utils");
const { getMoviePageUrl } = require("../../common/omniplex.co.uk/utils");
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

// A film's own page labels its credits in plain paragraphs -
// `<p class="text"><b>Director:</b> Christopher Nolan</p>` - and embeds its
// trailer. None of that reaches a showtimes page. A label that is absent is not
// an error: a live relay or a documentary often names no director.
function parseMoviePage(html) {
  const $ = cheerio.load(html);
  const labelled = (label) => {
    const $p = $("p.text")
      .filter((i, el) => getText($(el).find("b").first()) === label)
      .first();
    if (!$p.length) return "";
    const $credits = $p.clone();
    $credits.find("b").remove();
    return getText($credits);
  };
  return {
    directors: labelled("Director:"),
    actors: labelled("Starring:"),
    trailer: $(".video_player iframe").first().attr("src"),
  };
}

// A showtime box carries up to two markers: a "Hall Type Icon" image and a text
// label in its middle row. The icon's file name is the only thing that says
// what it means - the alt text is the same on all of them.
//
// The premium screens (MAXX, D-BOX, Infinity) are not accessibility and are
// listed so that they are recognised rather than read. Anything unlisted
// throws: an icon we have never seen could as easily be a new access marker as
// a new screen, and guessing wrong either way goes unnoticed.
const hallTypeIcons = {
  "sensory-friendly": { relaxed: true },
  "kids-club": { babyFriendly: true },
  "dbox-orange": {},
  maxx: {},
  infinity_icon: {},
};

// "Subtitled" is the only label seen. It marks the showing the film's card
// flags with its closed-caption icon - English-language films included - so it
// is captioning for deaf and hard of hearing audiences as well as subtitles.
const showtimeLabels = {
  subtitled: { subtitled: true, hardOfHearing: true },
};

function getShowtimeAccessibility($box, $, context) {
  let accessibility = {};

  $box.find('img[alt="Hall Type Icon"]').each((i, el) => {
    const src = $(el).attr("src") || "";
    const name = src
      .split("/")
      .pop()
      .replace(/\.[a-z]+$/i, "")
      .replace(/^.*_svgs_/, "");
    if (!(name in hallTypeIcons)) {
      throw new Error(`Unknown hall type icon "${src}" for ${context}`);
    }
    accessibility = { ...accessibility, ...hallTypeIcons[name] };
  });

  const label = getText($box.find(".midSection").first());
  if (label) {
    const labelAccessibility = showtimeLabels[label.toLowerCase()];
    if (!labelAccessibility) {
      throw new Error(`Unknown showtime label "${label}" for ${context}`);
    }
    accessibility = { ...accessibility, ...labelAccessibility };
  }

  return accessibility;
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
  const url = getMoviePageUrl(attributes.domain, moviePath);

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
        accessibility: createAccessibility(
          title,
          getShowtimeAccessibility($box, $, `${title} at ${timeText}`),
          synopsis,
        ),
        format: createFormat(title, {}, synopsis),
        occasions: createOccasions(title, {}, synopsis, {
          date: performanceDate,
        }),
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

async function transform({ datePages, moviePages }, sourcedEvents) {
  // Retrieved data from before the film pages were fetched has no key at all.
  // That is a stale retrieve, not a venue with no credits, and quietly carrying
  // on would drop every director and cast member without anyone noticing.
  if (!moviePages) {
    throw new Error(
      "Retrieved data has no moviePages - it predates the film-page retrieve, so re-run the retrieve",
    );
  }

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
        const moviePage = moviePages[url];
        if (!moviePage) {
          throw new Error(
            `No film page was retrieved for ${url} - the retrieve and transform disagree about which films are on`,
          );
        }
        const { directors, actors, trailer } = parseMoviePage(moviePage);

        movieMap.set(url, {
          showingId: generateShowingId(attributes, eventId),
          title,
          url,
          overview: createOverview({
            duration,
            categories: genre,
            classification,
            directors,
            actors,
            trailer,
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
