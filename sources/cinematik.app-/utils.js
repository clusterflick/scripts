const cheerio = require("cheerio");
const { format } = require("date-fns");

// The sites Cinematik's programmes run on - read from its Programmes menu on
// each retrieve - are where it sells tickets itself, so a JSON-LD address is
// judged against them. Only `www.cinematik.app` has been seen giving one: every
// programme's own booking page names that as its address, Escapes' and
// elevenfiftyfive's included. Eido, on a domain of its own, had nothing booking
// when this was written, so its pages may name eidocinema.com instead.
const isOnProgrammeSite = (url, origins, pathPrefix) => {
  if (typeof url !== "string") return false;
  const { origin, pathname } = new URL(url);
  return origins.includes(origin) && pathname.startsWith(pathPrefix);
};

// A book page's JSON-LD names the address the ticket is actually sold at. Where
// Cinematik sells it, that is its own booking page; where it only aggregates a
// venue's listing, it is the venue's box office (princecharlescinema.com,
// whatson.bfi.org.uk, myvue.com) - the page then offers an "External booking"
// button and nothing else. Box offices are any site at all, so it is the
// programme sites that are known, not the venues.
const isSoldOnCinematik = (event, origins) =>
  isOnProgrammeSite(event.url, origins, "/book/");

const getSlugFromEventUrl = (url, origins) =>
  isOnProgrammeSite(url, origins, "/events/")
    ? new URL(url).pathname.match(/^\/events\/([^/]+)$/)?.[1]
    : undefined;

// Every screening belongs to an event - the film's run in that programme -
// whose address is the same on every programme's site.
const getEventSlug = (event, origins) => {
  const url = event.superEvent?.url;
  const slug = getSlugFromEventUrl(url, origins);
  if (!slug) {
    throw new Error(
      `No event address in the JSON-LD of ${event.identifier} (superEvent: ${url})`,
    );
  }
  return slug;
};

// Once a screening has happened, its booking page redirects to its event's
// page: the event's EventSeries JSON-LD, with the screening's own Event gone
// and the screening dropped from the series' `subEvent` list. The sitemap is
// written once a day, so a screening earlier the same day is still listed -
// first seen on 23 November 2026, at The Welfare, Ystradgynlais and then Curzon
// Oxford.
//
// A browser also shows a notice ("The screening for ... has now happened"), but
// that is a Rails flash, carried in a cookie set on the redirect, and a fetch
// that follows the redirect without a cookie jar never sees it - so it can't be
// what tells the page apart. What can is all of: the series is there, it no
// longer lists this screening, and the date the screening's address ends in is
// not in the future. Any other page without an Event still fails the retrieve.
//
// The redirect starts as the screening does, but the series goes on listing it
// for a while after: at 18:04 on 24 November 2026 the 18:00 screenings at
// Brynamman and the Alhambra redirected while still in `subEvent`, and
// Abbeygate's failed that evening's retrieve. So a screening the series still
// lists counts as passed too, once the start it lists it with has gone by.
const BOOK_PATH_DATE = /-(\d{4}-\d{2}-\d{2})$/;

const getPassedScreeningEventSlug = (
  url,
  jsonLd,
  origins,
  now = new Date(),
) => {
  const series = jsonLd.flat().find((data) => data["@type"] === "EventSeries");
  if (!series) return undefined;

  const { pathname } = new URL(url);
  const date = pathname.match(BOOK_PATH_DATE)?.[1];
  if (!date || date > format(now, "yyyy-MM-dd")) return undefined;

  const listed = (series.subEvent ?? []).find(
    (subEvent) =>
      typeof subEvent.url === "string" &&
      new URL(subEvent.url).pathname === pathname,
  );
  if (listed && !(new Date(listed.startDate).getTime() <= now.getTime())) {
    return undefined;
  }

  const slug = getSlugFromEventUrl(series.url, origins);
  if (!slug) {
    throw new Error(
      `${url} redirected to an event page that names no event ` +
        `(EventSeries: ${series.url})`,
    );
  }
  return slug;
};

// Once the last of an event's screenings has started, the event page goes (it
// redirects to the programme's home page) and its screenings' booking pages
// answer 410 Gone with the notice a redirect would have carried as a flash:
// "The screening for I See Buildings Fall Like Lightning (Relaxed Screenings)
// has now happened", from every one of Escapes' relaxed screenings at 19:00 on
// 24 November 2026, which the day's sitemap still listed. A 410 is read as that
// only with the notice, and only for a date not in the future; anything else
// still fails the retrieve.
const HAPPENED_NOTICE = /\bThe screening for .+ has now happened\b/;

const isHappenedScreeningPage = (url, html, now = new Date()) => {
  const date = new URL(url).pathname.match(BOOK_PATH_DATE)?.[1];
  if (!date || date > format(now, "yyyy-MM-dd")) return false;
  const text = cheerio.load(html).root().text().replace(/\s+/g, " ");
  return HAPPENED_NOTICE.test(text);
};

// An Escapes event page lists its first 40 screenings in start order, finished
// ones included, each greyed out with "Closed" (or "Cancelled") where a
// bookable one says "Book Now". So a run with more than 40 screenings stops
// showing any bookable one once its first 40 have passed: I See Buildings Fall
// Like Lightning's page did, at 19:00 on 24 November 2026, with 42 still to
// come in its JSON-LD. That page is full rather than stale, and tells itself
// apart by every row it lists being over.
const FINISHED_STATUSES = new Set(["closed", "cancelled"]);

const showsOnlyFinishedScreenings = ($) => {
  const statuses = $(".info-row")
    .map((_, row) => $(row).find(".uppercase").text().trim().toLowerCase())
    .get();
  return (
    statuses.length > 0 &&
    statuses.every((status) => FINISHED_STATUSES.has(status))
  );
};

module.exports = {
  isSoldOnCinematik,
  showsOnlyFinishedScreenings,
  getEventSlug,
  getPassedScreeningEventSlug,
  isHappenedScreeningPage,
};
