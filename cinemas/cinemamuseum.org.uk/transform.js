const cheerio = require("cheerio");
const { parse } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  getText,
  createPerformance,
  createOverview,
  basicNormalize,
  getMovieTitleAndYearFrom,
  generateShowingId,
} = require("../../common/utils");
const attributes = require("./attributes");

function parseDate(dateString) {
  return parse(dateString, "EEE d MMM yyyy @ HH:mm", new Date(), {
    locale: enGB,
  });
}

function getDate($) {
  const dateString = getText($(".entry_header h4")).split("·")[0].trim();

  const dateFromHeading = parseDate(dateString);
  if (!isNaN(dateFromHeading.getTime())) return dateFromHeading;

  // If the date can't be parsed, it may be because they forgot to put the time.
  // Check the description to see if there's a time mentioned.
  const description = getText($(".entry"));
  const timeMatch = description.match(
    /doors open at [^\s]+ for a ([^\s]+) start/i,
  );
  if (!timeMatch) return;

  const constructedDate = parseDate(
    `${dateString} @ ${timeMatch[1].replace(".", ":")}`,
  );
  if (!isNaN(constructedDate.getTime())) return constructedDate;
}

async function transform({ moviePages }, sourcedEvents) {
  const movies = {};

  Object.keys(moviePages).forEach((url) => {
    const moviePage = moviePages[url];
    const $ = cheerio.load(moviePage);

    const $title = $(".entry_header h2");
    const $note = $title.find("span");
    const soldOut = basicNormalize(getText($note)).includes("sold out");
    $note.remove();
    const title = getText($title);
    const postId = $(".post.type-post").attr("id").replace("post-", "");
    const showingId = generateShowingId(attributes, postId);

    if (!movies[showingId]) {
      let directors;
      const description = getText($(".entry"));
      const directedByMatch = description.match(
        /directed\s+by\s+(.*?)(?:\n|,|;|\sand\s|\swith\s)/i,
      );
      if (directedByMatch) {
        directors = directedByMatch[1].replace(/\.$/, "");
      }
      const { year } = getMovieTitleAndYearFrom(title);
      const overview = createOverview({ year, directors });
      movies[showingId] = { showingId, title, url, overview, performances: [] };
    }

    const date = getDate($);
    if (!date) return;

    const bookingUrl = $(".entry")
      .find(
        [
          "a:contains('Ticketlab')",
          "a:contains('TicketLab')",
          "a:contains('Ticketsource')",
          "a:contains('TicketSource')",
        ].join(","),
      )
      .attr("href");
    movies[showingId].performances = movies[showingId].performances.concat(
      createPerformance({ date, url: bookingUrl || url, status: { soldOut } }),
    );
  });

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return Object.values(movies).concat(listOfSourcedEvents);
}

module.exports = transform;
