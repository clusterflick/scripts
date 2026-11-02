const { format } = require("date-fns");
const {
  createAccessibility,
  createFormat,
  createOverview,
  createPerformance,
  generateShowingId,
} = require("../../common/utils");
const attributes = require("./attributes");
const { parseEvents, isFilmEvent } = require("./utils");

const getLumaSlug = (url) =>
  url?.match(/^https?:\/\/(?:www\.)?(?:luma\.com|lu\.ma)\/([^/?#]+)/)?.[1];

async function transform({ movieListPage }, sourcedEvents) {
  const sourced = Object.values(sourcedEvents).flat();

  // An event booked through Luma reaches us from the source too, with the time
  // it actually starts rather than this page's "6-9pm". Keeping both would list
  // the one night twice, so the page's copy gives way - but only when the source
  // really did find it, so that a miss there can't lose the screening.
  const sourcedLumaSlugs = new Set(
    sourced.map(({ url }) => getLumaSlug(url)).filter(Boolean),
  );

  const movies = parseEvents(movieListPage)
    .filter(isFilmEvent)
    .filter(({ bookingUrl }) => !sourcedLumaSlugs.has(getLumaSlug(bookingUrl)))
    .map(({ date, title, soldOut, text, bookingUrl }) => ({
      showingId: generateShowingId(
        attributes,
        `${format(date, "yyyy-MM-dd")}-${title}`,
      ),
      title,
      url: attributes.url,
      overview: createOverview({}),
      performances: [
        createPerformance({
          date,
          url: bookingUrl || attributes.url,
          status: { soldOut },
          accessibility: createAccessibility(title, {}, text),
          format: createFormat(title, {}, text),
        }),
      ],
      matchingHints: { overview: text },
    }));

  return movies.concat(sourced);
}

module.exports = transform;
