const cheerio = require("cheerio");
const { parse } = require("date-fns");

const collapse = (value) => value.replace(/\s+/g, " ").trim();

// The page keeps every screening it has ever run, and marks one called off by
// putting "CANCELLED" where its date would be. That row names no day, so there
// is nothing to list.
const CANCELLED = /^cancelled$/i;

const parseDate = (day, time) => {
  const dayText = day.replace(/(\d+)(?:st|nd|rd|th)\b/i, "$1");
  const timeText = time.replace(/\s+/g, "").toLowerCase();
  const format = timeText.includes(":")
    ? "d MMMM yyyy h:mmaaa"
    : "d MMMM yyyy haaa";
  const date = parse(`${dayText} ${timeText}`, format, new Date());
  return Number.isNaN(date.getTime()) ? null : date;
};

// "Cinema show times" is one table of date, film and time, newest first. A film
// whose screening is on sale links to its own page; older rows are plain text.
// A row that doesn't read as a date and a time means the table has changed and
// a film could be hiding in it, so it fails rather than being skipped.
const parseShowings = (html) => {
  const $ = cheerio.load(html);
  const heading = $("h2")
    .toArray()
    .find((h2) => collapse($(h2).text()).toLowerCase() === "cinema show times");
  if (!heading) {
    throw new Error(
      "No Cinema show times heading found - has the page changed?",
    );
  }
  const $table = $(heading)
    .nextAll("figure.wp-block-table")
    .first()
    .find("table");
  const headers = $table
    .find("thead th")
    .toArray()
    .map((th) => collapse($(th).text()).toLowerCase());
  if (headers.join("|") !== "date|film|time") {
    throw new Error(`Unexpected show times columns: ${headers.join(", ")}`);
  }

  const showings = [];
  $table.find("tbody tr").each(function () {
    const cells = $(this).find("td");
    const [day, title, time] = cells
      .toArray()
      .map((td) => collapse($(td).text()));
    if (cells.length !== 3 || !title) {
      throw new Error(
        `Show times row breaks the pattern: ${collapse($(this).text())}`,
      );
    }
    if (CANCELLED.test(day)) return;
    const date = parseDate(day, time);
    if (!date) {
      throw new Error(`Show times row has no readable date: ${day} ${time}`);
    }
    showings.push({
      date,
      title,
      url: $(cells[1]).find("a").attr("href"),
    });
  });
  return showings;
};

// A film's page tells it in a few paragraphs, beside the My Tickets form that
// sells it. The form says how many tickets are left, and nothing when the page
// has no form to show.
const parseMoviePage = (html) => {
  const $ = cheerio.load(html);
  const $content = $("article .entry-content").first();
  if ($content.length === 0) {
    throw new Error("No film page content found - has the page changed?");
  }
  const remaining = $content.find(".tickets-remaining .value").first().text();
  const $text = $content.clone();
  $text
    .find("form, figure, script, style, .sharedaddy, .jp-relatedposts")
    .remove();
  const description = $text
    .find("p")
    .toArray()
    .map((p) => collapse($(p).text()))
    .filter(Boolean)
    .join("\n");
  return {
    description,
    ticketsRemaining: remaining.trim() === "" ? undefined : Number(remaining),
  };
};

module.exports = { parseShowings, parseMoviePage };
