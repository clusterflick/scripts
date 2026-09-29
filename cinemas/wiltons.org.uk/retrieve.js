const cheerio = require("cheerio");
const { fetchText } = require("../../common/utils");
const { url } = require("./attributes");

// Safety cap on pagination - Wilton's only lists a handful of films, so this
// should never be reached; throw if it is, rather than looping forever.
const MAX_PAGES = 25;

async function retrieve() {
  // Page through the film listing until a page returns no results
  const movieListPages = [];
  const moviePageUrls = new Set();
  let page = 1;
  while (page <= MAX_PAGES) {
    const listPage = await fetchText(`${url}&event-page=${page}`);
    const $ = cheerio.load(listPage);
    const bookButtons = $(".WhatsOnList .WhatsonItem .BookBtn");

    // An empty page past the first is the end of the listing. An empty first
    // page is not a venue with nothing on - it is the site serving us something
    // other than its listing, and passing it on as an empty retrieve only
    // defers the failure to transform, past the retry that could clear it.
    if (bookButtons.length === 0 && page === 1) {
      throw new Error(`No films found on ${url}&event-page=${page}`);
    }
    if (bookButtons.length === 0) break;

    movieListPages.push(listPage);
    bookButtons.each(function () {
      const href = $(this).attr("href");
      // Hrefs point at the movie page with a "#Tickets_in" fragment - drop it
      if (href) moviePageUrls.add(href.split("#")[0]);
    });

    page += 1;
  }

  if (page > MAX_PAGES) {
    throw new Error(
      "Exceeded maximum page limit — stopping condition may have changed",
    );
  }

  const moviePages = {};
  for (const moviePageUrl of moviePageUrls) {
    moviePages[moviePageUrl] = await fetchText(moviePageUrl);
  }

  return { movieListPages, moviePages };
}

module.exports = retrieve;
