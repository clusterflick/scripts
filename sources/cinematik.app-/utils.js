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
// page, which says so in a notice ("The screening for I See Buildings Fall Like
// Lightning has now happened. Hope to you see you at the next one!") and
// carries the event's EventSeries JSON-LD, the screening's own Event gone. The
// sitemap is written once a day, so a screening earlier the same day is still
// listed - first seen on 23 November 2026, a matinee at The Welfare,
// Ystradgynlais. Only that page is recognised: the notice and the series
// together, so any other page without an Event still fails the retrieve.
const PASSED_NOTICE = /\bhas now happened\b/i;

const getPassedScreeningEventSlug = ($, jsonLd, origins) => {
  const notice = $(".notice")
    .map((_, el) => $(el).text())
    .get()
    .find((text) => PASSED_NOTICE.test(text));
  if (!notice) return undefined;
  const series = jsonLd.flat().find((data) => data["@type"] === "EventSeries");
  const slug = getSlugFromEventUrl(series?.url, origins);
  if (!slug) {
    throw new Error(
      `A screening's page says it "has now happened" but names no event ` +
        `(EventSeries: ${series?.url})`,
    );
  }
  return slug;
};

module.exports = {
  isSoldOnCinematik,
  getEventSlug,
  getPassedScreeningEventSlug,
};
