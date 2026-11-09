const cheerio = require("cheerio");
const { addDays, parse } = require("date-fns");
const { domain } = require("./attributes");

const collapse = (value) => value.replace(/\s+/g, " ").trim();

const getEventUrl = (eventNo) => `${domain}/whats-on/event?event_no=${eventNo}`;

// The what's on page's grid of cards, one per event. Each carries the title and
// links to the event's own page, which is where the time, place and
// description are. The same events also sit in a "popular" carousel above the
// grid, so only the grid is read.
const getListedEvents = (listingPage) => {
  const $ = cheerio.load(listingPage);
  const events = new Map();
  $(".fpr-section-events .fpr-cards-card").each((_, card) => {
    const href = $(card).find("a[href*='event_no=']").first().attr("href");
    const eventNo = href?.match(/event_no=(\d+)/)?.[1];
    const title = collapse($(card).find("h3").first().text());
    if (!eventNo || !title) {
      throw new Error(`Unreadable event card: ${collapse($(card).text())}`);
    }
    events.set(eventNo, { eventNo, title });
  });
  return [...events.values()];
};

// The pier hosts markets, yoga, quizzes and sport as well as screenings, and
// the site files none of it as film: its categories are "Kids and family",
// "Music and entertainment" and the like. The title is the signal. The
// descriptions are not - "film" turns up in the copy for the Christmas lights,
// the opening weekend and a pub quiz - so they are left out of the test.
const isFilmTitle = (title) =>
  /\b(films?|cinemas?|screenings?|movies?)\b/i.test(title);

// "15 November 2026" and "05.00 PM - 07.30 PM", London time. A range ending
// earlier than it starts has run past midnight.
const parseTimes = (date, time) => {
  const match = time.match(
    /^(\d{1,2}\.\d{2} [AP]M)(?: - (\d{1,2}\.\d{2} [AP]M))?$/i,
  );
  if (!match) throw new Error(`Unrecognised event time: "${time}"`);
  const [, start, end] = match;
  const at = (clock) => parse(`${date} ${clock}`, "dd MMMM yyyy hh.mm a", 0);
  const startDate = at(start);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error(`Unrecognised event date: "${date} ${start}"`);
  }
  if (!end) return { startDate };
  let endDate = at(end);
  if (endDate <= startDate) endDate = addDays(endDate, 1);
  return { startDate, endDate };
};

// An event page holds its details in the "event detail" section: the title,
// the description, and a column of "Label: value" lines for the date, time,
// price and location, all rendered on the server.
const parseEventPage = (html) => {
  const $ = cheerio.load(html);
  const section = $(".fpr-section-eventdetail").first();
  const title = collapse(section.find("h1").first().text());
  if (!title) throw new Error("No event title on the event page");

  const details = {};
  section.find(".fpr-order-mobile-first > div").each((_, line) => {
    const match = collapse($(line).text()).match(/^(\w+): (.+)$/);
    if (match) details[match[1].toLowerCase()] = match[2];
  });
  if (!details.date) throw new Error(`No date for "${title}"`);
  if (!details.time) throw new Error(`No time for "${title}"`);

  // One hidden counter per ticket type, holding the tickets left. The page
  // swaps "Book now" for a waitlist when every one reads zero; a free event
  // has no tickets and so no counters.
  const ticketsLeft = $(".fpr-ticket-counter")
    .map((_, counter) => parseInt($(counter).text().trim(), 10))
    .get();

  return {
    title,
    description: collapse(section.find(".fpr-text-rich").first().text()),
    ...parseTimes(details.date, details.time),
    location: details.location,
    isSoldOut:
      ticketsLeft.length > 0 && ticketsLeft.every((count) => count === 0),
  };
};

module.exports = {
  getEventUrl,
  getListedEvents,
  isFilmTitle,
  parseEventPage,
};
