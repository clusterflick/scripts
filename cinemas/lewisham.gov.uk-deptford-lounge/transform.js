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

// Parse runtime like "1H21M", "1H47M", or "2H" (minutes optional) to minutes
const parseRuntimeMins = (runtime) => {
  const match = runtime.match(/(\d+)H(?:(\d+)M)?/i);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + minutes;
};

// Format 1: "Thursday 8th January – 6:00pm"
const parseDateTime = (dateLine, year) => {
  const normalized = dateLine.replace(/\s*[–-]\s*/, ` ${year} `);
  return parse(normalized, "EEEE do MMMM yyyy h:mma", new Date());
};

// Format 2: "Thursday 14th May – Deptford Library – 6:30 – 8:00pm"
// am/pm only appears on end time; we apply it to start time too
const parseFestivalDateTime = (dateLine, year) => {
  const parts = dateLine.split(/\s*[–-]\s*/);
  if (parts.length < 3) return null;

  const datePart = parts[0].trim();
  const endTime = parts[parts.length - 1].trim();
  const startTime = parts[parts.length - 2].trim();

  const period = endTime.match(/(am|pm)/i)?.[1];
  if (!period || !/^\d+:\d+$/.test(startTime)) return null;

  return parse(
    `${datePart} ${year} ${startTime}${period}`,
    "EEEE do MMMM yyyy h:mma",
    new Date(),
  );
};

// Format 1: "Title\n\nDirector – Year – Runtime – Cert.\n\nDate – Time\n\nDescription"
function transformFormat1(emailText) {
  const movies = [];
  const currentYear = new Date().getFullYear();

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
        duration: parseRuntimeMins(runtime),
        classification: getValidClassification(cert),
      }),
      performances: [
        createPerformance({
          date,
          url: movieUrl,
          accessibility: createAccessibility(
            title,
            { subtitled: true },
            description,
          ),
        }),
      ],
      matchingHints: {
        overview: description.trim().split("\n\n")[0],
      },
    });
  }

  return movies;
}

// Format 3: New regular schedule format using ===... (titles) and ---... (section boundaries)
// "Title\n====\n\nDirector – Year – Runtime – Cert. N\n----\n\nDate – Time\n----\n\nDescription"
function transformFormat3(emailText) {
  const movies = [];
  const currentYear = new Date().getFullYear();

  const metaPattern =
    /^(.+?)\s+[–-]\s+(\d{4})\s+[–-]\s+(\d+H(?:\d+M)?)\s+[–-]\s+Cert\.\s*(\S+)/;

  const parts = emailText.split(/\n={10,}\n/);

  for (let i = 1; i < parts.length; i++) {
    const prevLines = parts[i - 1].split("\n").filter((l) => l.trim());
    const title = prevLines[prevLines.length - 1]?.trim();
    if (!title) continue;

    const dashParts = parts[i].split(/\n-{10,}\n/);
    const metaLine = dashParts[0]?.trim();
    if (!metaLine) continue;

    const metaMatch = metaLine.match(metaPattern);
    if (!metaMatch) continue;

    const [, director, year, runtime, cert] = metaMatch;
    const dateLine = dashParts[1]?.trim();
    if (!dateLine) continue;

    const date = parseDateTime(dateLine, currentYear);
    if (!date || isNaN(date.getTime())) continue;

    const description = dashParts.slice(2).join("\n").trim();

    const slug = slugify(basicNormalize(title));
    const movieUrl = `${attributes.url}#${slug}`;
    const showingId = generateShowingId(
      attributes,
      `${slug}-${date.getTime()}`,
    );

    movies.push({
      showingId,
      title,
      url: movieUrl,
      overview: createOverview({
        year,
        directors: [director.trim()],
        duration: parseRuntimeMins(runtime),
        classification: getValidClassification(cert),
      }),
      performances: [
        createPerformance({
          date,
          url: movieUrl,
          accessibility: createAccessibility(
            title,
            { subtitled: true },
            description,
          ),
        }),
      ],
      matchingHints: {
        overview: description.trim().split("\n\n")[0],
      },
    });
  }

  return movies;
}

// Format 2: Festival format delimited by ===... (titles) and ---... (content boundaries)
// "Title\n====\n\n\nDate – Venue – StartTime – EndTime\n----\n\nDescription\n\nTicket URL\n----"
// Events with no parseable date/time (e.g. ongoing displays) are skipped.
function transformFormat2(emailText) {
  const movies = [];
  const currentYear = new Date().getFullYear();

  const parts = emailText.split(/\n={10,}\n/);

  for (let i = 1; i < parts.length; i++) {
    const prevLines = parts[i - 1].split("\n").filter((l) => l.trim());
    const title = prevLines[prevLines.length - 1]?.trim();
    if (!title) continue;

    const dashParts = parts[i].split(/\n-{10,}\n/);
    const dateLine = dashParts[0]?.trim();
    if (!dateLine) continue;

    const date = parseFestivalDateTime(dateLine, currentYear);
    if (!date || isNaN(date.getTime())) continue;

    const body = dashParts.slice(1).join("\n").trim();

    const ticketUrlMatch = body.match(/here!:\s*(https?:\/\/\S+)/);
    const url = ticketUrlMatch ? ticketUrlMatch[1] : attributes.url;

    const description = body.split(/\n\nGet your free ticket/)[0].trim();

    const slug = slugify(basicNormalize(title));
    const showingId = generateShowingId(
      attributes,
      `${slug}-${date.getTime()}`,
    );

    movies.push({
      showingId,
      title,
      url,
      overview: createOverview({}),
      performances: [
        createPerformance({
          date,
          url,
          accessibility: createAccessibility(title, {}, description),
        }),
      ],
      matchingHints: {
        overview: description.split("\n\n")[0],
      },
    });
  }

  return movies;
}

// Non-film entries that appear in the newsletter alongside screenings
const nonFilmTitlePatterns = [/^Discussion Group$/i];

async function transform({ emailText }, sourcedEvents) {
  const movies = [
    ...transformFormat1(emailText),
    ...transformFormat2(emailText),
    ...transformFormat3(emailText),
  ].filter(
    (movie) =>
      !nonFilmTitlePatterns.some((pattern) => pattern.test(movie.title)),
  );

  const listOfSourcedEvents = Object.values(sourcedEvents).flatMap(
    (events) => events,
  );
  return movies.concat(listOfSourcedEvents);
}

module.exports = transform;
