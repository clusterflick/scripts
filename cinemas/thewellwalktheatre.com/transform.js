const cheerio = require("cheerio");
const { parseISO } = require("date-fns");
const {
  generateShowingId,
  createPerformance,
  createOverview,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { extractPeopleNames } = require("../../common/extract-people");
const { isFilmEvent } = require("../../common/is-film-event");
const {
  getExperienceUrl,
  getOccurrenceStart,
  isSoldOut,
} = require("../../common/beyonk");
const attributes = require("./attributes");

// Descriptions come through as the HTML the venue typed into Beyonk
const getOverview = (description) =>
  cheerio
    .load(`<div>${description || ""}</div>`)("div")
    .first()
    .text()
    .trim();

async function transform({ experiences }, sourcedEvents) {
  const movies = [];

  for (const [experienceId, { detail, availability }] of Object.entries(
    experiences,
  )) {
    const title = `${detail.title}`.trim();
    if (!title) {
      throw new Error(`No title found for experience ${experienceId}`);
    }

    const url = getExperienceUrl(attributes.beyonkOrganisationId, experienceId);
    const overview = getOverview(detail.description);
    // Beyonk carries no category to filter on - a film and a Crafternoon have
    // exactly the same fields - so the listing's own words decide
    if (!isFilmEvent(`${title} ${overview}`)) continue;

    const performances = availability
      .flatMap(({ timeslots }) => timeslots || [])
      .map((slot) => {
        const date = parseISO(getOccurrenceStart(slot.timeslot?.occurrence));
        if (Number.isNaN(date.getTime())) {
          throw new Error(
            `Unreadable occurrence "${slot.timeslot?.occurrence}" for experience ${experienceId}`,
          );
        }

        return createPerformance({
          date,
          url,
          accessibility: createAccessibility(title, {}, overview),
          format: createFormat(title, {}, overview),
          status: { soldOut: isSoldOut(slot) },
        });
      });

    if (performances.length === 0) {
      // A run that has finished, or one not yet on sale, still has a page in
      // the shop. Skip it - the assertion below catches a structural change.
      continue;
    }

    movies.push({
      showingId: generateShowingId(attributes, experienceId),
      title,
      url: encodeURI(url),
      overview: createOverview({}),
      performances,
      matchingHints: {
        overview,
        crew: extractPeopleNames(overview),
      },
    });
  }

  // No assertion on `movies` here: most of what this venue lists isn't film,
  // so a run with nothing to show is a normal outcome rather than a broken
  // one. `retrieveExperiences` asserts the shop's structure instead.

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
