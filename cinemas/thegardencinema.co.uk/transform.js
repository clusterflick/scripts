const cheerio = require("cheerio");
const {
  convertToList,
  getText,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
  generateShowingId,
} = require("../../common/utils");
const { parseDate } = require("./utils");
const attributes = require("./attributes");

const isCatchAll = (value) => value.toLowerCase().trim().startsWith("various");

function getStatus($el) {
  return { soldOut: $el.hasClass("sold-out") };
}

function getAccessibility($el) {
  return {
    audioDescription: $el.hasClass("audio_description"),
    hardOfHearing: $el.hasClass("hoh"),
    babyFriendly: $el.hasClass("baby_screening"),
  };
}

// A screening carries one class per marker the cinema puts on it. What each
// marker means is the cinema's own: its stylesheet gives every tag a `content`
// rule, and the listing page's filter checkboxes repeat those words.
//
// Two of them are deliberately left out. `screening` is on every panel and says
// nothing, and `closed` is the booking window having passed rather than
// anything about the screening - every `closed` panel sits on the day the page
// was fetched and before the hour it was fetched at, with the same film's
// showing the next day unmarked. It describes the page's age, so it would be
// stale before the release carrying it was published.
function getNotes($el, festivals) {
  const notes = [];
  // The `festival` class is what makes a screening part of a festival; the
  // film-level link is only where the festival is named. Reading the class
  // rather than the link keeps a film programmed both inside and outside a
  // festival - which the markup allows, listing every screening on one page -
  // from claiming all of its showings for it.
  //
  // Worded exactly as the cinema words it, without an article. Its festival
  // names are a mix of things that take "the" ("... Film Festival") and things
  // that cannot ("Celebrating 75 Years of Contemporary Films", "Stolen
  // Identities"), and nothing in the markup says which a name is.
  if ($el.hasClass("festival")) {
    notes.push(...festivals.map((festival) => `Part of ${festival}`));
  }
  if ($el.hasClass("pay_what_you_can")) {
    notes.push(
      "The screening is Pay What You Can, which means you're free to pay as much or as little as you can afford.",
    );
  }
  if ($el.hasClass("intro")) {
    notes.push("The screening will be introduced.");
  }
  if ($el.hasClass("q_and_a")) {
    notes.push("The screening will be followed by a Q&A.");
  }
  if ($el.hasClass("live_music")) {
    notes.push("The screening will be accompanied by live music.");
  }
  if ($el.hasClass("discussion")) {
    notes.push("The screening will be followed by a discussion.");
  }
  if ($el.hasClass("matinee")) {
    notes.push("Matinee price");
  }
  return notes;
}

// The stats block opens with the film's programming links - a season or strand
// the cinema is running itself, and a festival someone else is running in the
// building. They read identically ("Part of <name>"), so the link path is what
// tells them apart, and only a festival earns a note: a season is the cinema's
// own shelf label, while a festival is a thing a reader can go and look up.
//
// Read before the stats block is emptied to parse the director/country/year
// line, which removes these links along with everything else.
function getFestivals($, $stats) {
  const festivals = [];
  $stats.find(".film-detail__film__season-link a").each(function () {
    const href = $(this).attr("href");
    if (!href) return;
    const { pathname } = new URL(href, attributes.url);
    if (!pathname.startsWith("/festival/")) return;
    festivals.push(getText($(this)));
  });
  return festivals;
}

function getPerformances($, $filmScreenings, title, overview, festivals) {
  const performances = [];
  const $screenings = $filmScreenings.find(".screening-panel");

  // The class and the link are two halves of one fact, so a screening marked as
  // part of a festival that the stats block does not name means the pairing has
  // broken. Throw rather than fall through to no note - a note going missing
  // quietly is what this code exists to fix.
  if (festivals.length === 0 && $screenings.is(".festival")) {
    throw new Error(
      `Screening is marked as part of a festival, but no festival is named for "${title}"`,
    );
  }

  $screenings.each(function () {
    // Screenings are grouped by date into a `screening-panel__day` wrapper,
    // which holds the date title alongside that day's list of screenings.
    const screeningDate = getText(
      $(this)
        .closest(".screening-panel__day")
        .find(".screening-panel__date-title"),
    );
    const $screeningTime = $(this).find(".screening-time");
    const screeningTime = getText($screeningTime);
    const date = parseDate(`${screeningDate} T ${screeningTime}`);
    const url = $screeningTime.find("a").attr("href");

    // In the past the Garden cinema has accidentally duplicates all
    // performances, so that they show twice. Detect this and filter them out.
    const isPerformanceDuplicate = performances.find(
      (performance) =>
        performance.time === date.getTime() && performance.bookingUrl === url,
    );
    if (isPerformanceDuplicate) return;

    performances.push(
      createPerformance({
        date,
        notesList: getNotes($(this), festivals),
        url,
        status: getStatus($(this)),
        accessibility: createAccessibility(
          title,
          getAccessibility($(this)),
          overview,
        ),
        format: createFormat(title, {}, overview),
      }),
    );
  });
  return performances;
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = moviePages.map((moviePages) => {
    const $ = cheerio.load(moviePages);

    const $title = $(".film-detail__title");

    const $ceritification = $title.find(".film-detail__film__rating");
    const classification = getText($ceritification);
    // Remove the classification element so that it doesn't come up in the title
    // text when we get that later
    $ceritification.remove();

    const $stats = $(".film-detail__film__stats");
    const festivals = getFestivals($, $stats);
    // Remove any links so we just have the raw stats text to parse
    $stats.children().each(function () {
      $(this).remove();
    });
    const stats = convertToList(getText($stats));

    let year;
    let directors = "";

    if (stats.length > 1) {
      directors = isCatchAll(stats[0]) ? "" : stats[0];

      // Sometimes the year position can change. Check in two places, but always
      // make sure we're just getting 4 digits
      const yearInSecondLastPosition = stats[stats.length - 2]?.match(/^\d{4}$/)
        ? stats[stats.length - 2]
        : undefined;
      const yearInThirdLastPosition = stats[stats.length - 3]?.match(/^\d{4}$/)
        ? stats[stats.length - 3]
        : undefined;
      year = yearInSecondLastPosition || yearInThirdLastPosition || undefined;
    }

    const $cast = $(".film-detail__cast");
    $cast.children().each(function () {
      $(this).remove();
    });

    const shortLinkUrl = $("link[rel='shortlink']").attr("href");
    const id = new URLSearchParams(new URL(shortLinkUrl).search).get("p");
    const title = getText($title);

    $(".film-detail__synopsis .info-bar").remove();
    const overview = getText($(".film-detail__synopsis"))
      .replace(/\n(\s*\n)+/gi, "\n\n")
      .trim();

    return {
      showingId: generateShowingId(attributes, id),
      title,
      url: new URL($('link[rel="canonical"]').attr("href")).href,
      overview: createOverview({
        year,
        duration: stats[stats.length - 1]?.replace("m.", ""),
        classification,
        directors,
        actors: getText($cast),
      }),
      performances: getPerformances(
        $,
        $(".film-detail__screenings").eq(0),
        title,
        overview,
        festivals,
      ),
      matchingHints: { overview },
    };
  });

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
