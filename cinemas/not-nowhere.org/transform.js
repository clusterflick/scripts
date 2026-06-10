const cheerio = require("cheerio");
const { parse, isBefore, startOfDay, addYears, subDays } = require("date-fns");
const { enGB } = require("date-fns/locale/en-GB");
const {
  createOverview,
  createPerformance,
  createAccessibility,
  generateShowingId,
  getText,
} = require("../../common/utils");
const attributes = require("./attributes");

const parseDateTime = (dateString, timeString) => {
  const startTime = timeString.split("–")[0].trim();
  const fullString = `${dateString} ${startTime}`;
  const parsedDate = parse(fullString, "EEE d MMM h.mma", new Date(), {
    locale: enGB,
  });

  if (isNaN(parsedDate.getTime())) {
    throw new Error(`Unable to parse date: "${fullString}"`);
  }

  const today = startOfDay(new Date());
  if (isBefore(parsedDate, subDays(today, 14))) return addYears(parsedDate, 1);

  return parsedDate;
};

async function transform({ moviePages }, sourcedEvents) {
  const movies = [];

  for (const [moviePageUrl, html] of Object.entries(moviePages)) {
    const $ = cheerio.load(html);

    const title = getText($("main h1"));
    if (!title) continue;

    const snipcartButton = $(".snipcart-add-item");
    const eventId =
      snipcartButton.attr("data-item-id") || moviePageUrl.split("/").pop();

    const description = $(".on-workshop-info p")
      .map((i, el) => getText($(el)))
      .get()
      .filter((text) => text.length > 0)
      .join("\n\n");

    const facilitatedBy = getText($(".detail-list > p").first());

    const performances = [];

    $(".detail-date").each((i, dateEl) => {
      const dateSpans = $(dateEl)
        .find(".card-text-date .ft-small")
        .map((j, el) => getText($(el)))
        .get();
      const dateString = dateSpans.join(" ");

      const timeslotsText = getText($(dateEl).find(".timeslots"));
      const timeslots = timeslotsText
        .split("\n")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      for (const timeslot of timeslots) {
        const date = parseDateTime(dateString, timeslot);
        const notesList = [];
        if (facilitatedBy) notesList.push(facilitatedBy);

        performances.push(
          createPerformance({
            date,
            notesList,
            url: moviePageUrl,
            accessibility: createAccessibility(title, {}, description),
          }),
        );
      }
    });

    if (performances.length === 0) continue;

    movies.push({
      showingId: generateShowingId(attributes, eventId),
      title,
      url: moviePageUrl,
      overview: createOverview({}),
      performances,
      matchingHints: {
        overview: description,
      },
    });
  }

  if (movies.length === 0) {
    throw new Error("No movies found - the page structure may have changed");
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
