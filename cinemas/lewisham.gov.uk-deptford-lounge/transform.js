const { parse } = require("date-fns");
const slugify = require("slugify");
const {
  generateShowingId,
  createOverview,
  createPerformance,
  createAccessibility,
  getValidClassification,
  basicNormalize,
} = require("../../common/utils");
const attributes = require("./attributes");

// Parse runtime like "1H21M" or "1H47M" to milliseconds
const parseRuntime = (runtime) => {
  const match = runtime.match(/(\d+)H(\d+)M/i);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return (hours * 60 + minutes) * 60 * 1000;
};

// Parse date like "Thursday 8th January – 6:00pm"
const parseDateTime = (dateLine, year) => {
  // Replace the dash (and surrounding spaces) with the year
  const normalized = dateLine.replace(/\s*[–-]\s*/, ` ${year} `);
  return parse(normalized, "EEEE do MMMM yyyy h:mma", new Date());
};

async function transform({ emailText }, sourcedEvents) {
  const movies = [];
  const currentYear = new Date().getFullYear();

  // Split into sections by looking for the film info pattern
  // Pattern: Title\n\nDirector – Year – Runtime – Cert\n\nDate – Time
  const filmPattern =
    /^(.+?)\n\n(.+?)\s+[–-]\s+(\d{4})\s+[–-]\s+(\dH\d+M)\s+[–-]\s+Cert\.\s*(\d+[A-Za-z]?)\n\n(.+?[–-]\s+\d+:\d+(?:am|pm))\n\n([\s\S]+?)(?=\n\n(?:[A-Z][^–\n]+\n\n[A-Za-z]+ [–-] \d{4})|(?:Discussion Group)|(?:Now you know)|$)/gim;

  let match;
  while ((match = filmPattern.exec(emailText)) !== null) {
    const [, title, director, year, runtime, cert, dateLine, description] =
      match;

    const date = parseDateTime(dateLine, currentYear);

    const slug = slugify(basicNormalize(title));
    const movieUrl = `${attributes.url}#${slug}`;

    const showingId = generateShowingId(
      attributes,
      `${slug}-${date.getTime()}`,
    );

    movies.push({
      showingId,
      title: title.trim(),
      url: movieUrl,
      overview: createOverview({
        year,
        directors: [director.trim()],
        runtime: parseRuntime(runtime),
        classification: getValidClassification(cert),
      }),
      performances: [
        createPerformance({
          date,
          url: movieUrl,
          accessibility: createAccessibility(
            title,
            { subtitled: true },
            description || "",
          ),
        }),
      ],
      matchingHints: {
        overview: description.trim().split("\n\n")[0],
      },
    });
  }

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
