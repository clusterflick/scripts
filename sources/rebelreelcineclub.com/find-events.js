const path = require("node:path");
const cheerio = require("cheerio");
const {
  createPerformance,
  createOverview,
  generateShowingId,
  readJSON,
  memoiseOnData,
  createAccessibility,
  createOccasions,
  createFormat,
} = require("../../common/utils");
const {
  venueMatchesCinema,
  extractPostcode,
} = require("../../common/source-utils");
const attributes = require("./attributes");

// Every screening is a shop product whose title is free text, and the date,
// time and venue are only ever written into it, in whatever order and spelling
// that week's listing used:
//
//   "Buffalo 66  - Wednesday 9th December  - Plaza Camden"
//   "Harold and Maude - Friday 31st July 2026 7pm  - Mildmay Club"
//   "O Brother, Where Art Thou? - Dungeness Beach - Saturday 3 August"
//   "FASTER PUSSYCAT! KILL! KILL! April 29th 2021 The Hang Out"
//
// The shop also keeps every past screening for sale, sold out or not, and
// sells things that aren't screenings (season passes, a towel), so a product
// is only a screening if a date can be read from it, and only listed if that
// date hasn't passed.

const WEEKDAY = "(mon|tue|wed|thu|fri|sat|sun)[a-z]*\\.?";
const MONTH =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const ORDINAL = "(\\d{1,2})(?:st|nd|rd|th)?";
const YEAR = "(\\d{4})";

// "Wednesday 9th December", "Weds. 29 Sept 2021", "5 March"
const DAY_FIRST = new RegExp(
  `\\b(?:${WEEKDAY}\\s+)?${ORDINAL}\\s+${MONTH}\\b(?:,?\\s+${YEAR}\\b)?`,
  "i",
);
// "April 29th 2021"
const MONTH_FIRST = new RegExp(
  `\\b(?:${WEEKDAY}\\s+)?${MONTH}\\b\\s+${ORDINAL}\\b(?:,?\\s+${YEAR}\\b)?`,
  "i",
);
// "7pm", "7.30pm", "6:30pm", "8,35pm"
const TIME = /\b(\d{1,2})(?:[.:,](\d{2}))?\s*(am|pm)\b/i;

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function findDate(text) {
  const dayFirst = text.match(DAY_FIRST);
  if (dayFirst) {
    const [, weekday, day, month, year] = dayFirst;
    return { match: dayFirst, weekday, day, month, year };
  }
  const monthFirst = text.match(MONTH_FIRST);
  if (monthFirst) {
    const [, weekday, month, day, year] = monthFirst;
    return { match: monthFirst, weekday, day, month, year };
  }
  return null;
}

// Most titles leave the year out, and some the weekday too ("5 March 7.30pm @
// Rio Cinema"). What places them is when the product went on sale: a
// screening is put on sale before it happens - a few weeks to six months
// before, across the shop's history - so it is the first such date on or after
// the day it was published, and on the weekday the title gives, if it gives
// one. (`addedOn` is no use for this: the club makes each listing by
// duplicating an old one, so it is the date of the listing first copied.)
function resolveDay({ weekday, day, month, year }, product) {
  const monthIndex = MONTHS.indexOf(month.toLowerCase().slice(0, 3));
  const dayOfMonth = Number(day);

  const at = (y) => new Date(y, monthIndex, dayOfMonth);
  const isRealDate = (date) => date.getDate() === dayOfMonth;

  if (year) {
    const date = at(Number(year));
    if (!isRealDate(date)) {
      throw new Error(`"${product.title}" names a date that doesn't exist`);
    }
    return date;
  }

  if (typeof product.publishOn !== "number") {
    throw new Error(
      `"${product.title}" gives no year, and has no publish date to place it by`,
    );
  }
  const published = new Date(product.publishOn);
  published.setHours(0, 0, 0, 0);
  const weekdayIndex =
    weekday && WEEKDAYS.indexOf(weekday.toLowerCase().slice(0, 3));

  // A weekday comes round on the same date only every five to eleven years,
  // so a title whose weekday matches none of the next two is a mistake in it
  // rather than a date far ahead.
  const date = [0, 1, 2]
    .map((offset) => at(published.getFullYear() + offset))
    .filter(isRealDate)
    .filter((candidate) => candidate >= published)
    .find((candidate) => !weekday || candidate.getDay() === weekdayIndex);
  if (!date) {
    throw new Error(
      `"${product.title}" gives no year, and its weekday doesn't fall on that date in the two years after it went on sale`,
    );
  }
  return date;
}

function toHoursAndMinutes(timeMatch) {
  const [, hour, minute = "00", meridiem] = timeMatch;
  const hours =
    (Number(hour) % 12) + (meridiem.toLowerCase() === "pm" ? 12 : 0);
  return { hours, minutes: Number(minute) };
}

// The product description, as lines of plain text.
function getDescriptionLines(html) {
  const $ = cheerio.load(html || "");
  $("br").replaceWith("\n");
  $("p, div, h1, h2, h3, h4, li").after("\n");
  return $.root()
    .text()
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// The time an event starts, as the listing advertises it: in the title when it
// is there ("Friday 31st July 2026 7pm"), otherwise when the doors or gates
// open ("Doors open 6pm"), otherwise the first time its running order gives
// ("Music from 7pm", "Film at 8.15pm").
function findStartTime(titleRest, lines) {
  const titleTime = titleRest.match(TIME);
  if (titleTime) return toHoursAndMinutes(titleTime);

  const openingLine = lines.find(
    (line) => /\b(?:doors|gates)\b/i.test(line) && TIME.test(line),
  );
  if (openingLine) return toHoursAndMinutes(openingLine.match(TIME));

  const timedLine = lines.find((line) => TIME.test(line));
  if (timedLine) return toHoursAndMinutes(timedLine.match(TIME));

  return null;
}

// The film's part of the title, without a time or separator left next to it
function cleanTitle(text) {
  return text
    .replace(TIME, "")
    .replace(/^\s*[-=@,]\s*/, "")
    .replace(/\s*[-=@,]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// A venue's part of the title, also without the words joining it to the date
// ("... 9pm at the Rio Cinema", "from 7pm - ...")
function cleanVenueSegment(text) {
  return cleanTitle(text)
    .replace(/^(?:at|from)\s+/i, "")
    .replace(/\s+(?:at|from)$/i, "")
    .trim();
}

// The names a venue could be going by in this listing: each " - " separated
// part of the title other than the film, and the first part of any line of
// the description giving an address ("Plaza Camden, 14 Parkway, Camden NW1
// 7AA"). Each is tried against the cinema in turn.
function getVenueCandidates(titleSegments, addressLine) {
  const candidates = titleSegments.flatMap((segment) => {
    const cleaned = cleanVenueSegment(segment);
    const parts = [cleaned];
    // "... at the Rio Cinema, Dalston", "@ Rio Cinema, Dalston"
    const atMatch = segment.match(/(?:\bat\b|@)\s+(?:the\s+)?(.+)$/i);
    if (atMatch) parts.push(cleanVenueSegment(atMatch[1]));
    return parts.flatMap((part) => [part, part.split(",")[0].trim()]);
  });
  if (addressLine) candidates.push(addressLine.split(",")[0].trim());
  return [...new Set(candidates.filter(Boolean))];
}

// "Directed by Vincent Gallo" / "USA, 1998", "Dir. Richard C. Sarafian 1971
// 98 mins", "Film length 1hr 50mins". Only a line that starts with the credit
// is one: mid-sentence, "directed by" runs on into whatever the sentence says.
function parseOverview(lines) {
  const directorIndex = lines.findIndex((line) =>
    /^(?:directed by|dir\.)/i.test(line),
  );
  let directors;
  let year;
  if (directorIndex !== -1) {
    const directorLine = lines[directorIndex];
    directors = directorLine
      .replace(/^(?:directed by|dir\.)\s*/i, "")
      .replace(/\s*\b(?:19|20)\d{2}\b.*$/, "")
      .trim();
    const yearMatch = lines
      .slice(directorIndex, directorIndex + 2)
      .join(" ")
      .match(/\b((?:19|20)\d{2})\b/);
    year = yearMatch ? yearMatch[1] : undefined;
  }

  const text = lines.join("\n");
  let duration;
  const hoursAndMinutes = text.match(/\b(\d)\s*hrs?\s*(\d{1,2})\s*mins?\b/i);
  const minutesOnly = text.match(/\b(\d{2,3})\s*mins?\b/i);
  if (hoursAndMinutes) {
    duration = Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2]);
  } else if (minutesOnly) {
    duration = Number(minutesOnly[1]);
  }

  return { directors, year, duration };
}

function isSoldOut(variants) {
  return (
    variants.length > 0 &&
    variants.every(({ unlimited, qtyInStock }) => !unlimited && qtyInStock <= 0)
  );
}

function parseProduct(product) {
  // The club marks some finished listings itself, but not all of them, so this
  // only saves reading dates out of descriptions written years ago.
  if (/^\s*PAST EVENT\b/i.test(product.title)) return null;

  const title = product.title.trim();
  const lines = getDescriptionLines(product.excerpt);
  const description = lines.join("\n");

  // The date belongs in the title. A product with none there is a screening
  // only if its description names exactly one date ("Stand By Me Lake
  // Screening Ticket"); anything else - a season pass listing every date of
  // its season, a towel listing none - isn't one.
  let dateMatch = findDate(title);
  let titleBefore = title;
  let titleAfter = "";
  if (dateMatch) {
    titleBefore = title.slice(0, dateMatch.match.index);
    titleAfter = title.slice(dateMatch.match.index + dateMatch.match[0].length);
  } else {
    const datedLines = lines.filter((line) => findDate(line));
    if (datedLines.length !== 1) return null;
    dateMatch = findDate(datedLines[0]);
    titleAfter = datedLines[0].slice(
      dateMatch.match.index + dateMatch.match[0].length,
    );
  }

  const day = resolveDay(dateMatch, product);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (day < startOfToday) return null;

  // Left unset rather than thrown on here: the club's outdoor screenings
  // outside London start "at sunset" and match none of our venues, and they
  // shouldn't fail every venue's run. One that does match is thrown on there.
  const startTime = findStartTime(titleAfter, lines);
  let date = null;
  if (startTime) {
    date = new Date(day);
    date.setHours(startTime.hours, startTime.minutes);
  }

  const [filmTitle, ...beforeSegments] = titleBefore
    .split(/\s+-\s+|\s+=\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const afterSegments = titleAfter
    .split(/\s+-\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const addressLine = lines.find((line) => extractPostcode(line));

  return {
    id: product.id,
    listingTitle: product.title,
    title: cleanTitle(filmTitle || title),
    url: `${attributes.domain}${product.fullUrl}`,
    date,
    description,
    soldOut: isSoldOut(product.variants),
    overview: parseOverview(lines),
    // The film's own part is tried too, for "Sideways at Westwell Winery"
    venueCandidates: getVenueCandidates(
      [filmTitle || "", ...beforeSegments, ...afterSegments],
      addressLine,
    ),
    eventAddress: addressLine,
  };
}

// The same for every cinema asked about, so built once per retrieved file -
// see memoiseOnData.
const parseProducts = memoiseOnData((data) =>
  (data.products || []).map(parseProduct).filter(Boolean),
);

async function findEvents(cinema) {
  const dataSrc = path.join(process.cwd(), "retrieved-data", attributes.id);

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  return parseProducts(data)
    .filter((screening) =>
      screening.venueCandidates.some((venueName) =>
        venueMatchesCinema(cinema, venueName, null, {
          eventAddress: screening.eventAddress,
        }),
      ),
    )
    .map((screening) => {
      if (!screening.date) {
        throw new Error(
          `No start time for "${screening.listingTitle}" in its title or description - the listing format may have changed`,
        );
      }
      return screening;
    })
    .map((screening) => ({
      showingId: generateShowingId(attributes, screening.id),
      title: screening.title,
      url: screening.url,
      overview: createOverview(screening.overview),
      performances: [
        createPerformance({
          date: screening.date,
          url: screening.url,
          notesList: [`Presented by ${attributes.name}`],
          status: { soldOut: screening.soldOut },
          accessibility: createAccessibility(
            screening.title,
            {},
            screening.description,
          ),
          format: createFormat(screening.title, {}, screening.description),
          occasions: createOccasions(
            screening.title,
            {},
            screening.description,
            { date: screening.date },
          ),
        }),
      ],
      matchingHints: { overview: screening.description },
    }));
}

module.exports = findEvents;
