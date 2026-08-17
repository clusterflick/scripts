const cheerio = require("cheerio");
const { fetchText, fetchWithRetry } = require("../../common/utils");
const attributes = require("./attributes");

const SEARCH_URL = `${attributes.domain}/searchresults/adv`;

// The advanced search takes the ids behind its region and genre dropdowns
// rather than their names.
const LONDON_REGION_ID = "4";
// "Film" covers screenings at a venue that programmes them; pop-up cinema is a
// genre of its own that the "Film" search never returns, so both are asked for.
const FILM_GENRE_IDS = ["20", "110"];

/**
 * Run a search and return the session cookie its results are held against.
 *
 * The search is a POST that stores its parameters against a PHP session and
 * redirects to a results page rendered from whatever that session holds, so
 * the results - and the paging links below them - are only reachable by
 * carrying the cookie back.
 */
async function startSearch(genreId) {
  const response = await fetchWithRetry(SEARCH_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      adv_region: LONDON_REGION_ID,
      adv_genre: genreId,
    }).toString(),
    // Following the redirect drops the cookie, and a results page requested
    // without one silently reports every event on the site rather than failing.
    redirect: "manual",
  });

  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error(
      `No session cookie returned when searching genre ${genreId} - the search may no longer be session-backed`,
    );
  }

  return setCookie.split(";")[0];
}

async function retrieveGenre(genreId) {
  const cookie = await startSearch(genreId);

  const movieListPages = [];
  const moviePageUrls = [];
  const requestedUrls = new Set();

  let url = SEARCH_URL;
  while (url && !requestedUrls.has(url)) {
    requestedUrls.add(url);
    const html = await fetchText(url, { headers: { cookie } });
    movieListPages.push(html);

    const $ = cheerio.load(html);
    $("a.event_link").each(function () {
      moviePageUrls.push(new URL($(this).attr("href"), attributes.domain).href);
    });

    // Paging links are session-scoped too, and carry a "#paginate" fragment
    // that would have us request the same page under two different keys.
    const nextHref = $("#paginate a.nextlink").attr("href");
    if (!nextHref) break;
    const nextUrl = new URL(nextHref, attributes.domain);
    nextUrl.hash = "";
    url = nextUrl.href;
  }

  return { movieListPages, moviePageUrls };
}

async function retrieve() {
  const movieListPages = [];
  const moviePages = {};

  for (const genreId of FILM_GENRE_IDS) {
    const genre = await retrieveGenre(genreId);
    movieListPages.push(...genre.movieListPages);

    for (const moviePageUrl of genre.moviePageUrls) {
      // An event can be listed under more than one of the genres searched
      if (moviePages[moviePageUrl]) continue;
      moviePages[moviePageUrl] = await fetchText(moviePageUrl);
    }
  }

  return { movieListPages, moviePages };
}

module.exports = retrieve;
