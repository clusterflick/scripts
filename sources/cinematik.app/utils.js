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

// Every screening belongs to an event - the film's run in that programme -
// whose address is the same on every programme's site.
const getEventSlug = (event, origins) => {
  const url = event.superEvent?.url;
  const slug = isOnProgrammeSite(url, origins, "/events/")
    ? new URL(url).pathname.match(/^\/events\/([^/]+)$/)?.[1]
    : undefined;
  if (!slug) {
    throw new Error(
      `No event address in the JSON-LD of ${event.identifier} (superEvent: ${url})`,
    );
  }
  return slug;
};

module.exports = { isSoldOnCinematik, getEventSlug };
