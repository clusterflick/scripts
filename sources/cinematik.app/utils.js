// A book page's JSON-LD names the address the ticket is actually sold at. Where
// Cinematik sells it, that is its own booking page; where it only aggregates a
// venue's listing, it is the venue's box office (princecharlescinema.com,
// whatson.bfi.org.uk, myvue.com) - the page then offers an "External booking"
// button and nothing else.
const isSoldOnCinematik = (event) =>
  typeof event.url === "string" &&
  event.url.startsWith("https://www.cinematik.app/book/");

// Every screening belongs to an event - the film's run in that programme -
// whose address is the same on every programme's site.
const getEventSlug = (event) => {
  const url = event.superEvent?.url;
  const slug = url?.match(
    /^https:\/\/www\.cinematik\.app\/events\/([^/?#]+)$/,
  )?.[1];
  if (!slug) {
    throw new Error(
      `No event address in the JSON-LD of ${event.identifier} (superEvent: ${url})`,
    );
  }
  return slug;
};

module.exports = { isSoldOnCinematik, getEventSlug };
