const path = require("node:path");
const cheerio = require("cheerio");
const { parse } = require("date-fns");
const {
  createPerformance,
  createOverview,
  generateShowingId,
  readJSON,
  createAccessibility,
  createFormat,
} = require("../../common/utils");
const { venueMatchesCinema } = require("../../common/source-utils");
const { getExperienceUrl } = require("../../common/beyonk");
const attributes = require("./attributes");

// Each venue page is a Next.js app router page, which ships its React tree as
// `self.__next_f.push([1, "<refId>:<tree JSON>"])` calls - one per script tag.
// The schedule, the address and the booking details all sit in the one row
// holding the page body, so find that row and parse it. React numbers the ref
// ids in hex, hence `[0-9a-f]+`.
function readPageTree($) {
  const chunks = $("script")
    .map((i, el) => $(el).html() || "")
    .get()
    .map((script) => script.match(/^self\.__next_f\.push\((\[.*\])\)$/s))
    .filter(Boolean)
    .map((match) => JSON.parse(match[1])[1])
    .filter((chunk) => typeof chunk === "string");

  const chunk = chunks.find((value) => value.includes('"days":'));
  const refId = chunk?.match(/^[0-9a-f]+:/);
  if (!refId) {
    throw new Error(
      "Could not find the schedule in the page data. Has the page changed?",
    );
  }
  return JSON.parse(chunk.slice(refId[0].length));
}

function findNodes(tree, predicate) {
  const found = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      if (predicate(node)) found.push(node);
      Object.values(node).forEach(walk);
    }
  };
  walk(tree);
  return found;
}

// The ticket section labels the address "Location" and gives it as one line -
// "The Plaza, 14 The Parkway, London NW1 7AA". A venue booked through its own
// box office lists a phone number under it in the same style, so take the
// first one.
function getAddress(tree) {
  const [address] = findNodes(
    tree,
    ({ className, children }) =>
      /^TicketShopEmbed_addressText/.test(className || "") &&
      typeof children === "string",
  ).map(({ children }) => children.trim());

  if (!address) {
    throw new Error("Could not find the venue address. Has the page changed?");
  }
  return address;
}

// Screenings are booked in one of two ways. Where the pop-up sells its own
// tickets the page embeds a Beyonk shop, with an experience per film; where a
// host venue sells them (Turner Sims in Southampton) the schedule carries a
// link per screening instead, keyed by "yyyy-MM-dd HH:mm".
function getBookingUrl({ shop, bookingLinks }, key, { time, film }) {
  const bookingLink = bookingLinks?.[`${key} ${time}`];
  if (bookingLink) return bookingLink;

  const experienceId = shop?.experiences?.[film];
  if (experienceId) return getExperienceUrl(shop.organisation, experienceId);

  throw new Error(`No booking link for ${film} on ${key} at ${time}`);
}

function getEvents(venuePath, tree) {
  const [schedule] = findNodes(tree, ({ days }) => Array.isArray(days));
  const [shop] = findNodes(
    tree,
    ({ organisation, experiences }) => organisation && experiences,
  );
  const venueUrl = `${attributes.domain}${venuePath}`;
  const venueSlug = venuePath.split("/").filter(Boolean).at(-1);

  const eventsByFilm = {};
  for (const { key, screenings } of schedule.days) {
    for (const screening of screenings) {
      const { film, time } = screening;
      const date = parse(`${key} ${time}`, "yyyy-MM-dd HH:mm", new Date());
      const url = getBookingUrl(
        { shop, bookingLinks: schedule.bookingLinks },
        key,
        screening,
      );

      eventsByFilm[film] = eventsByFilm[film] || {
        showingId: generateShowingId(attributes, `${venueSlug}-${film}`),
        title: film,
        url: venueUrl,
        overview: createOverview({}),
        performances: [],
        matchingHints: {},
      };
      eventsByFilm[film].performances.push(
        createPerformance({
          date,
          url,
          notesList: [`Presented by ${attributes.name}`],
          status: {},
          accessibility: createAccessibility(film, {}, ""),
          format: createFormat(film, {}, ""),
        }),
      );
    }
  }

  return Object.values(eventsByFilm);
}

async function findEvents(cinema) {
  const dataSrc = path.join(
    process.cwd(),
    "retrieved-data",
    "enchantedchristmascinema.co.uk",
  );

  let data = {};
  try {
    data = await readJSON(dataSrc);
  } catch {
    return [];
  }

  const events = [];
  for (const [venuePath, html] of Object.entries(data.venuePages)) {
    const tree = readPageTree(cheerio.load(html));
    const address = getAddress(tree);
    // The address leads with the building's name, which is the name the
    // pop-up gives its host - "The Plaza", "Yorkshire Museum", "Turner Sims"
    const venueName = address.split(",")[0].trim();

    if (
      venueMatchesCinema(cinema, venueName, undefined, {
        eventAddress: address,
      })
    ) {
      events.push(...getEvents(venuePath, tree));
    }
  }

  return events;
}

module.exports = findEvents;
