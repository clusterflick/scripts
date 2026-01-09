const cheerio = require("cheerio");
const { fetchText, basicNormalize } = require("../../common/utils.js");

const filmsUrl =
  "https://dice.fm/browse/london-54d8a23438fe5d27d500001c/culture/film";
const theatreUrl =
  "https://dice.fm/browse/london-54d8a23438fe5d27d500001c/culture/theatre";

const getEvents = (page) => {
  const $ = cheerio.load(page);
  const data = JSON.parse($("#__NEXT_DATA__").html());
  return data.props.pageProps.events;
};

async function retrieve() {
  const movieListPages = {
    film: await fetchText(filmsUrl),
    theatre: await fetchText(theatreUrl),
  };
  const moviePages = {};

  const filmEvents = getEvents(movieListPages.film);
  for (const event of filmEvents) {
    const url = `https://dice.fm/event/${event.perm_name}`;
    const html = await fetchText(url);
    moviePages[url] = html;
  }

  const theatreEvents = getEvents(movieListPages.theatre);
  for (const event of theatreEvents) {
    // Only get theatre listings which could be movies in the wrong category
    if (
      basicNormalize(event.name).includes("movie") ||
      basicNormalize(event.name).includes("film")
    ) {
      const url = `https://dice.fm/event/${event.perm_name}`;
      const html = await fetchText(url);
      moviePages[url] = html;
    }
  }

  return { movieListPages, moviePages };
}

module.exports = retrieve;
