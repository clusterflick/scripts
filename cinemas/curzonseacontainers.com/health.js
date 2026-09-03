const cheerio = require("cheerio");
const { format } = require("date-fns");
const { getText } = require("../../common/utils");
const {
  probeText,
  probeError,
  startObservation,
  withChallengeRetry,
} = require("../../common/health-probe");
const { parseDate } = require("./utils");
const attributes = require("./attributes");

// A Curzon, but not on the chain API the other ten are: this venue is ticketed
// by Veezi on its own site token, so it carries its own probe beside `retrieve`
// and `transform` rather than joining `common/ocapi-v1`.
//
// The single Veezi page is the whole listing - a `.film` per title, a
// `.date-container` per day it plays, and a booking link per showing - and it is
// the only request the retrieve makes. So this saves nothing and is here for the
// observation: an hourly check that the page still parses, against a retrieve
// that finds out once a day. It reads the same `#sessionsByFilmConent` panel the
// transform reads, so a change that would break the transform breaks this first.
const GRANULARITY = "performance";

const FILM = "#sessionsByFilmConent .film";
// Veezi drops both tab panels and renders this instead when the venue has
// nothing scheduled, which the transform reads the same way: an empty listing
// rather than a broken one.
const EMPTY_STATE = "p.empty";

const tally = (html) => {
  const $ = cheerio.load(html);
  const $films = $(FILM);

  if ($films.length === 0) {
    if ($(EMPTY_STATE).length > 0) return null;
    throw probeError(
      `No \`${FILM}\` entries and no \`${EMPTY_STATE}\` marker - the page structure may have changed`,
    );
  }

  const films = new Set();
  const byDate = {};
  const unparsed = [];

  $films.each(function () {
    const $film = $(this);
    // The title is the identity the transform slugs into its showing id, since
    // Veezi's own event codes rotate whenever Curzon rebuilds the sessions.
    const title = getText($film.find(".title"));

    $film.find(".date-container").each(function () {
      const day = getText($(this).find(".date"));

      $(this)
        .find(".session-times li a")
        .each(function () {
          const time = getText($(this).find("time"));
          let date;
          try {
            date = format(parseDate(`${day} @ ${time}`), "yyyy-MM-dd");
          } catch {
            unparsed.push(`${day} @ ${time}`.trim() || "(empty session)");
            return;
          }
          byDate[date] = (byDate[date] ?? 0) + 1;
          if (title) films.add(title);
          else unparsed.push(`(a session on ${date} with no film title)`);
        });
    });
  });

  if (unparsed.length > 0) {
    throw probeError(
      `${unparsed.length} session(s) were unreadable (e.g. "${unparsed[0]}")`,
    );
  }

  return { films, byDate };
};

async function health(venues) {
  const { countRequest, reasonFor, finalise } = startObservation(GRANULARITY);
  const [venue] = venues;

  let counted;
  try {
    const html = await withChallengeRetry(
      () => probeText(attributes.url),
      venue.id,
    );
    countRequest();
    counted = tally(html);
  } catch (error) {
    countRequest();
    return finalise([{ venue: venue.id, reason: reasonFor(error) }]);
  }

  const dates = counted ? Object.keys(counted.byDate).sort() : [];
  if (dates.length === 0) {
    return finalise([
      { venue: venue.id, reason: { kind: "no-listings-found" } },
    ]);
  }

  return finalise([
    {
      venue: venue.id,
      counts: {
        performances: dates.reduce(
          (total, date) => total + counted.byDate[date],
          0,
        ),
        films: counted.films.size,
        dates: dates.length,
      },
      // Sorted so consecutive cycles diff cleanly.
      byDate: Object.fromEntries(
        dates.map((date) => [date, counted.byDate[date]]),
      ),
    },
  ]);
}

module.exports = health;
